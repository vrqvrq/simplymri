const express = require('express');
const router = express.Router();
const db = require('../models/db');

// Portal auth middleware
function requirePatient(req, res, next) {
  if (!req.session || !req.session.patient) {
    return res.redirect('/portal/login');
  }
  res.locals.patient = req.session.patient;
  next();
}

// Login page
router.get('/login', (req, res) => {
  res.render('pages/portal/login', { error: null });
});

// Login with Patient ID + DOB
router.post('/login', (req, res) => {
  const { patient_id, date_of_birth } = req.body;
  const patient = db.prepare('SELECT * FROM patients WHERE patient_id = ? AND date_of_birth = ?').get(patient_id, date_of_birth);

  if (!patient) {
    return res.render('pages/portal/login', { error: 'Invalid Patient ID or Date of Birth. Please contact the lab if you need help.' });
  }

  req.session.patient = {
    id: patient.id,
    patient_id: patient.patient_id,
    first_name: patient.first_name,
    last_name: patient.last_name,
    email: patient.email,
    phone: patient.phone
  };

  res.redirect('/portal');
});

// Logout
router.get('/logout', (req, res) => {
  delete req.session.patient;
  res.redirect('/portal/login');
});

// Dashboard
router.get('/', requirePatient, (req, res) => {
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.session.patient.id);

  const recentResults = db.prepare(`
    SELECT tr.*, tc.code, tc.name as test_name, tc.category, tc.unit,
      lo.order_number, lo.created_at as order_date, lo.ordering_physician
    FROM test_results tr
    JOIN test_catalog tc ON tr.test_id = tc.id
    JOIN lab_orders lo ON tr.order_id = lo.id
    WHERE lo.patient_id = ? AND tr.status IN ('completed', 'verified') AND tr.result_value IS NOT NULL
    ORDER BY tr.performed_at DESC LIMIT 20
  `).all(req.session.patient.id);

  const pendingOrders = db.prepare(`
    SELECT lo.*, (SELECT COUNT(*) FROM test_results WHERE order_id = lo.id) as test_count,
      (SELECT COUNT(*) FROM test_results WHERE order_id = lo.id AND status IN ('completed','verified')) as done_count
    FROM lab_orders lo
    WHERE lo.patient_id = ? AND lo.status IN ('pending', 'in_progress')
    ORDER BY lo.created_at DESC
  `).all(req.session.patient.id);

  const completedOrders = db.prepare(`
    SELECT lo.*, (SELECT COUNT(*) FROM test_results WHERE order_id = lo.id) as test_count
    FROM lab_orders lo
    WHERE lo.patient_id = ? AND lo.status IN ('completed', 'verified')
    ORDER BY lo.created_at DESC LIMIT 10
  `).all(req.session.patient.id);

  const unpaidInvoices = db.prepare(`
    SELECT i.*, lo.order_number FROM invoices i
    JOIN lab_orders lo ON i.order_id = lo.id
    WHERE i.patient_id = ? AND i.status = 'unpaid'
    ORDER BY i.created_at DESC
  `).all(req.session.patient.id);

  const mriStudies = db.prepare(`
    SELECT ms.*,
      (SELECT report_status FROM mri_reports WHERE study_id = ms.id LIMIT 1) as report_status
    FROM mri_studies ms
    WHERE ms.patient_id = ?
    ORDER BY ms.created_at DESC LIMIT 5
  `).all(req.session.patient.id);

  res.render('pages/portal/dashboard', { patient, recentResults, pendingOrders, completedOrders, unpaidInvoices, mriStudies });
});

// View order results
router.get('/order/:id', requirePatient, (req, res) => {
  const order = db.prepare(`
    SELECT lo.* FROM lab_orders lo
    WHERE lo.id = ? AND lo.patient_id = ?
  `).get(req.params.id, req.session.patient.id);

  if (!order) return res.status(404).send('Order not found');

  const results = db.prepare(`
    SELECT tr.*, tc.code, tc.name as test_name, tc.category, tc.unit,
      tc.reference_range_text, tc.description as test_description
    FROM test_results tr
    JOIN test_catalog tc ON tr.test_id = tc.id
    WHERE tr.order_id = ?
    ORDER BY tc.category, tc.name
  `).all(order.id);

  res.render('pages/portal/order', { order, results });
});

// Result history API for patient charts
router.get('/api/history', requirePatient, (req, res) => {
  const testCode = req.query.test || '';
  if (!testCode) {
    const tests = db.prepare(`
      SELECT DISTINCT tc.code, tc.name as test_name, tc.unit
      FROM test_results tr
      JOIN test_catalog tc ON tr.test_id = tc.id
      JOIN lab_orders lo ON tr.order_id = lo.id
      WHERE lo.patient_id = ? AND tr.result_numeric IS NOT NULL
      ORDER BY tc.name
    `).all(req.session.patient.id);
    return res.json(tests);
  }

  const history = db.prepare(`
    SELECT tr.result_numeric, tr.result_value, tr.performed_at, tr.flag,
      tc.code, tc.name as test_name, tc.unit, tc.reference_range_min, tc.reference_range_max
    FROM test_results tr
    JOIN test_catalog tc ON tr.test_id = tc.id
    JOIN lab_orders lo ON tr.order_id = lo.id
    WHERE lo.patient_id = ? AND tc.code = ? AND tr.result_numeric IS NOT NULL
    ORDER BY tr.performed_at ASC
  `).all(req.session.patient.id, testCode);

  res.json(history);
});

// Download PDF report (reuse existing route logic)
router.get('/report/:orderId', requirePatient, (req, res) => {
  const order = db.prepare('SELECT * FROM lab_orders WHERE id = ? AND patient_id = ?').get(req.params.orderId, req.session.patient.id);
  if (!order) return res.status(404).send('Report not found');
  // Redirect to the existing report generator
  res.redirect(`/reports/lab-report/${req.params.orderId}`);
});

// Invoices
router.get('/invoices', requirePatient, (req, res) => {
  const invoices = db.prepare(`
    SELECT i.*, lo.order_number FROM invoices i
    JOIN lab_orders lo ON i.order_id = lo.id
    WHERE i.patient_id = ?
    ORDER BY i.created_at DESC
  `).all(req.session.patient.id);

  res.render('pages/portal/invoices', { invoices });
});

// Profile
router.get('/profile', requirePatient, (req, res) => {
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.session.patient.id);
  res.render('pages/portal/profile', { patient });
});

// MRI Studies list
router.get('/mri', requirePatient, (req, res) => {
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.session.patient.id);

  const studies = db.prepare(`
    SELECT ms.*,
      (SELECT COUNT(*) FROM mri_images WHERE study_id = ms.id) as image_count,
      (SELECT report_status FROM mri_reports WHERE study_id = ms.id LIMIT 1) as report_status
    FROM mri_studies ms
    WHERE ms.patient_id = ?
    ORDER BY ms.created_at DESC
  `).all(req.session.patient.id);

  res.render('pages/portal/mri-studies', { patient, studies });
});

// MRI Study detail with report and images
router.get('/mri/:id', requirePatient, (req, res) => {
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.session.patient.id);

  const study = db.prepare(`
    SELECT ms.* FROM mri_studies ms
    WHERE ms.id = ? AND ms.patient_id = ?
  `).get(req.params.id, req.session.patient.id);

  if (!study) return res.status(404).send('Study not found');

  const report = db.prepare(`
    SELECT * FROM mri_reports WHERE study_id = ? AND report_status = 'final'
  `).get(study.id);

  const images = db.prepare(`
    SELECT * FROM mri_images WHERE study_id = ? ORDER BY series_number, image_number
  `).all(study.id);

  // Group images by series
  const series = {};
  images.forEach(img => {
    const key = `${img.series_number}-${img.series_description}`;
    if (!series[key]) series[key] = { number: img.series_number, description: img.series_description, images: [] };
    series[key].images.push(img);
  });

  res.render('pages/portal/mri-detail', { patient, study, report, images, series: Object.values(series) });
});

// PACS Viewer for patient
router.get('/mri/:id/viewer', requirePatient, (req, res) => {
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.session.patient.id);

  const study = db.prepare(`
    SELECT ms.* FROM mri_studies ms
    WHERE ms.id = ? AND ms.patient_id = ?
  `).get(req.params.id, req.session.patient.id);

  if (!study) return res.status(404).send('Study not found');

  const report = db.prepare(`
    SELECT * FROM mri_reports WHERE study_id = ? AND report_status = 'final'
  `).get(study.id);

  const images = db.prepare(`
    SELECT * FROM mri_images WHERE study_id = ? ORDER BY series_number, image_number
  `).all(study.id);

  const series = {};
  images.forEach(img => {
    const key = `${img.series_number}-${img.series_description}`;
    if (!series[key]) series[key] = { number: img.series_number, description: img.series_description, images: [] };
    series[key].images.push(img);
  });

  res.render('pages/portal/pacs-viewer', { patient, study, report, images, series: Object.values(series) });
});

// AI Image Interpretation API
router.post('/mri/:id/ai-interpret', requirePatient, (req, res) => {
  const study = db.prepare(`
    SELECT ms.* FROM mri_studies ms
    WHERE ms.id = ? AND ms.patient_id = ?
  `).get(req.params.id, req.session.patient.id);

  if (!study) return res.status(404).json({ error: 'Study not found' });

  const report = db.prepare(`
    SELECT * FROM mri_reports WHERE study_id = ? AND report_status = 'final'
  `).get(study.id);

  const images = db.prepare(`
    SELECT * FROM mri_images WHERE study_id = ? ORDER BY series_number, image_number
  `).all(study.id);

  // Group images by series for context
  const seriesList = {};
  images.forEach(img => {
    const key = img.series_description || `Series ${img.series_number}`;
    if (!seriesList[key]) seriesList[key] = { description: img.series_description, count: 0, thickness: img.slice_thickness };
    seriesList[key].count++;
  });

  const bodyPart = (study.body_part || '').toLowerCase();
  const question = req.body.question || 'general';

  // Generate patient-friendly AI interpretation
  const interpretation = generatePatientInterpretation(study, report, Object.values(seriesList), question);

  res.json(interpretation);
});

function generatePatientInterpretation(study, report, seriesList, question) {
  const bodyPart = (study.body_part || '').toLowerCase();
  const contrast = study.contrast || 'without';
  const hasReport = !!report;

  const result = {
    studyOverview: '',
    whatWeScanned: '',
    imagingTechniques: [],
    findings: [],
    impression: '',
    whatThisMeans: '',
    nextSteps: '',
    anatomyGuide: [],
    faq: []
  };

  // Study Overview
  result.studyOverview = `This is an MRI (Magnetic Resonance Imaging) scan of your ${study.body_part.toLowerCase()}. ` +
    `MRI uses powerful magnets and radio waves — not radiation — to create detailed pictures of the inside of your body. ` +
    (contrast !== 'without'
      ? `A contrast dye was used to help certain structures show up more clearly.`
      : `No contrast dye was used for this study.`);

  // What we scanned
  result.whatWeScanned = `Your ${study.body_part.toLowerCase()} was scanned ` +
    (study.performed_date ? `on ${new Date(study.performed_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : '') +
    (study.scanner ? ` using a ${study.scanner}` : '') + '. ' +
    `The scan produced ${seriesList.reduce((sum, s) => sum + s.count, 0)} images across ${seriesList.length} different series (viewing angles and techniques).`;

  // Imaging techniques explained
  seriesList.forEach(s => {
    const desc = (s.description || '').toLowerCase();
    let explanation = '';
    if (desc.includes('t1')) {
      explanation = 'T1-weighted images show fat as bright and fluid as dark. This is great for seeing normal anatomy and structure.';
    } else if (desc.includes('t2')) {
      explanation = 'T2-weighted images show fluid as bright and are excellent for detecting swelling, inflammation, or fluid collections.';
    } else if (desc.includes('flair')) {
      explanation = 'FLAIR images suppress the signal from normal fluid (like spinal fluid) so that abnormal areas of swelling or disease stand out more clearly.';
    } else if (desc.includes('pd') || desc.includes('proton')) {
      explanation = 'Proton Density images provide detailed views of cartilage and other soft tissues, often used to evaluate joint structures.';
    } else if (desc.includes('stir')) {
      explanation = 'STIR images suppress fat signal and are very sensitive to swelling and inflammation in tissues.';
    } else if (desc.includes('diffusion') || desc.includes('dwi')) {
      explanation = 'Diffusion-weighted images detect how water molecules move through tissue, helpful for identifying areas of restricted movement like acute injuries.';
    } else {
      explanation = 'This sequence provides additional views to help the radiologist evaluate different tissue characteristics.';
    }

    const orientDesc = desc.includes('sag') ? 'side view' :
      desc.includes('axial') || desc.includes('ax') ? 'cross-section (top-down) view' :
      desc.includes('coronal') || desc.includes('cor') ? 'front-to-back view' : 'multiple viewing angles';

    result.imagingTechniques.push({
      name: s.description || 'Standard Sequence',
      imageCount: s.count,
      sliceThickness: s.thickness || 'standard',
      explanation: explanation,
      orientation: orientDesc
    });
  });

  // Body-part specific anatomy guide
  if (bodyPart.includes('brain') || bodyPart.includes('head')) {
    result.anatomyGuide = [
      { structure: 'Cerebral Hemispheres', description: 'The two halves of the brain that control thought, movement, and sensation. They appear as the large gray masses filling most of the image.' },
      { structure: 'Ventricles', description: 'Fluid-filled spaces inside the brain that produce and circulate cerebrospinal fluid. They appear as dark (T1) or bright (T2) areas in the center.' },
      { structure: 'Gray & White Matter', description: 'Gray matter (outer brain surface) processes information; white matter (inner connections) carries signals between brain regions.' },
      { structure: 'Cerebellum', description: 'Located at the lower back of the head, it coordinates balance and movement. It has a distinctive folded, striped appearance.' },
      { structure: 'Skull & Meninges', description: 'The protective bone and membrane layers surrounding the brain. The skull appears as a bright outer ring.' }
    ];
  } else if (bodyPart.includes('spine') || bodyPart.includes('lumbar') || bodyPart.includes('cervical') || bodyPart.includes('thoracic')) {
    result.anatomyGuide = [
      { structure: 'Vertebral Bodies', description: 'The bony building blocks of your spine. They appear as rectangular bright (T1) or intermediate signal structures stacked on top of each other.' },
      { structure: 'Intervertebral Discs', description: 'The cushion-like pads between each vertebra. Healthy discs appear bright on T2 images due to their water content; dehydrated or damaged discs appear darker.' },
      { structure: 'Spinal Cord', description: 'The main nerve highway running through the center of your spine. It appears as a thin, cord-like structure within the spinal canal.' },
      { structure: 'Spinal Canal & CSF', description: 'The protective tunnel of bone surrounding the spinal cord. Cerebrospinal fluid (CSF) appears bright on T2 images and cushions the cord.' },
      { structure: 'Neural Foramina', description: 'The openings on the sides of the spine where nerve roots exit. Narrowing here can cause pain, numbness, or weakness.' },
      { structure: 'Paraspinal Muscles', description: 'The muscles running alongside the spine that provide support and enable movement.' }
    ];
  } else if (bodyPart.includes('knee')) {
    result.anatomyGuide = [
      { structure: 'Femur & Tibia', description: 'The thigh bone (femur) and shin bone (tibia) that meet at the knee joint. Bone marrow inside appears bright on T1 images.' },
      { structure: 'Menisci', description: 'C-shaped cartilage cushions (medial and lateral) between the femur and tibia. They appear as dark triangles and act as shock absorbers. Tears show as bright lines within them.' },
      { structure: 'ACL & PCL', description: 'The anterior and posterior cruciate ligaments that stabilize the knee. They appear as dark bands crossing inside the joint.' },
      { structure: 'Articular Cartilage', description: 'The smooth, slippery coating on the ends of the bones. It allows smooth joint movement and appears as a thin layer over the bone ends.' },
      { structure: 'Joint Fluid', description: 'Normal small amounts of fluid lubricate the joint. Excess fluid (effusion) appears bright on T2 and may indicate inflammation or injury.' }
    ];
  } else {
    result.anatomyGuide = [
      { structure: 'Soft Tissues', description: 'Muscles, tendons, and ligaments in the scanned area. MRI excels at showing these structures in detail.' },
      { structure: 'Bones & Marrow', description: 'The skeletal structures and the marrow inside them. Bone marrow appears bright on T1 images.' },
      { structure: 'Fluid Spaces', description: 'Any fluid collections, joint spaces, or normal fluid-containing structures. These appear bright on T2 images.' }
    ];
  }

  // Interpret the report findings in patient-friendly language
  if (hasReport) {
    // Parse findings into patient-friendly bullet points
    if (report.findings) {
      const sentences = report.findings.split(/\.\s+/).filter(s => s.trim().length > 5);
      result.findings = sentences.map(s => ({
        original: s.trim().replace(/\.$/, '') + '.',
        simplified: simplifyFinding(s, bodyPart)
      }));
    }

    if (report.impression) {
      result.impression = report.impression;
      result.whatThisMeans = simplifyImpression(report.impression, bodyPart);
    }

    if (report.recommendations) {
      result.nextSteps = simplifyRecommendations(report.recommendations);
    } else {
      result.nextSteps = 'No specific follow-up recommendations were noted. Please discuss the results with your ordering physician for personalized guidance.';
    }
  } else {
    result.whatThisMeans = 'Your radiology report has not been finalized yet. Once the radiologist completes their review, an AI-powered plain-language explanation will be available here.';
    result.nextSteps = 'Please check back after the radiologist has finalized the report.';
  }

  // FAQ
  result.faq = generateFAQ(bodyPart, contrast, hasReport, report);

  return result;
}

function simplifyFinding(finding, bodyPart) {
  const f = finding.toLowerCase();

  // Common radiology terms → plain language
  const translations = [
    [/no\s+(evidence|sign|indication)\s+of/i, 'No signs of'],
    [/unremarkable/i, 'appears normal'],
    [/within normal limits/i, 'is within the normal range'],
    [/no acute/i, 'No new or urgent'],
    [/no significant/i, 'No notable'],
    [/normal in (caliber|size|signal|appearance|morphology)/i, 'normal in size and appearance'],
    [/midline structures? (are|is) (normal|midline|not shifted)/i, 'the brain structures are properly centered (not pushed to one side)'],
    [/no mass (effect|lesion)/i, 'no abnormal growth or mass is seen'],
    [/no intracranial (hemorrhage|mass|lesion)/i, 'no bleeding or masses inside the skull'],
    [/no herniation/i, 'brain tissue is not being pushed out of its normal position'],
    [/disc (protrusion|herniation|bulge|extrusion)/i, 'a disc (cushion between vertebrae) is pushing outward'],
    [/neural foraminal (stenosis|narrowing)/i, 'the opening where nerves exit the spine is narrowed'],
    [/spinal (canal )?(stenosis|narrowing)/i, 'the spinal canal (tunnel for the spinal cord) is narrowed'],
    [/nerve root (compression|impingement|displacement)/i, 'a nerve is being pressed on or pushed aside'],
    [/meniscal tear/i, 'a tear in the meniscus (knee cartilage cushion)'],
    [/chondromalacia/i, 'softening or wear of cartilage (early arthritis changes)'],
    [/effusion/i, 'excess fluid (swelling)'],
    [/edema/i, 'swelling from fluid buildup'],
    [/signal (abnormality|change|alteration)/i, 'an area that looks different from normal tissue on the scan'],
    [/hyperintense/i, 'brighter than normal on the scan (may indicate fluid or inflammation)'],
    [/hypointense/i, 'darker than normal on the scan'],
    [/desiccation/i, 'drying out (loss of water content)'],
    [/degenerative/i, 'age-related wear-and-tear'],
    [/osteophyte/i, 'bone spur (extra bone growth)'],
    [/ligament.{0,20}intact/i, 'the ligament is undamaged'],
    [/no fracture/i, 'no broken bones']
  ];

  let simplified = finding.trim();
  for (const [pattern, replacement] of translations) {
    if (pattern.test(simplified)) {
      simplified = simplified.replace(pattern, replacement);
    }
  }

  return simplified.charAt(0).toUpperCase() + simplified.slice(1);
}

function simplifyImpression(impression, bodyPart) {
  const lower = impression.toLowerCase();

  if (lower.includes('normal') && !lower.includes('abnormal')) {
    return 'Good news — the radiologist found your ' + bodyPart.toLowerCase() + ' scan to be essentially normal. ' +
      'No significant abnormalities were identified. This is a reassuring result, but always discuss with your doctor for complete context.';
  }

  if (lower.includes('tear') && bodyPart.toLowerCase().includes('knee')) {
    return 'The scan shows a tear in part of your knee. Meniscal tears are among the most common knee injuries. ' +
      'Depending on the size and location of the tear, treatment can range from rest and physical therapy to a minimally invasive procedure. ' +
      'Your doctor will discuss the best approach for your specific situation.';
  }

  if ((lower.includes('protrusion') || lower.includes('herniation') || lower.includes('bulge')) &&
      (bodyPart.toLowerCase().includes('spine') || bodyPart.toLowerCase().includes('lumbar'))) {
    return 'The scan shows a disc issue in your spine. The discs act as cushions between the bones of your spine, and sometimes ' +
      'they can push outward (protrude or bulge). If a disc presses on a nearby nerve, it can cause pain, numbness, or weakness. ' +
      'Many disc problems improve with conservative treatment like physical therapy. Your doctor will help determine the best plan for you.';
  }

  // Generic interpretation
  return 'The radiologist has completed their review and documented their clinical impression. ' +
    'Please review the impression section above and discuss the findings with your ordering physician, ' +
    'who can explain what this means for your specific health situation and recommend next steps.';
}

function simplifyRecommendations(recommendations) {
  const lower = recommendations.toLowerCase();
  let simplified = 'Your radiologist recommends: ';

  if (lower.includes('follow-up') || lower.includes('followup') || lower.includes('follow up')) {
    simplified += 'A follow-up visit or scan may be needed. ';
  }
  if (lower.includes('clinical correlation')) {
    simplified += 'Your doctor should compare these findings with your symptoms for a complete picture. ';
  }
  if (lower.includes('physical therapy') || lower.includes('conservative')) {
    simplified += 'Non-surgical treatment options like physical therapy may be recommended. ';
  }
  if (lower.includes('surgical') || lower.includes('orthopedic') || lower.includes('neurosurgical')) {
    simplified += 'A specialist consultation may be recommended to discuss treatment options. ';
  }

  simplified += 'Please discuss these recommendations with your doctor.';
  return simplified;
}

function generateFAQ(bodyPart, contrast, hasReport, report) {
  const faqs = [
    {
      q: 'Is MRI safe?',
      a: 'Yes. MRI uses magnetic fields and radio waves — there is no ionizing radiation (unlike X-rays or CT scans). It is one of the safest imaging methods available.'
    },
    {
      q: 'What does it mean if something appears bright or dark on the image?',
      a: 'Different tissues appear as different shades depending on the imaging technique. On T1 images, fat is bright and fluid is dark. On T2 images, fluid is bright. These differences help the radiologist distinguish normal from abnormal tissue.'
    }
  ];

  if (contrast !== 'without') {
    faqs.push({
      q: 'Why was contrast dye used?',
      a: 'Contrast dye helps certain structures and abnormalities show up more clearly. It is injected through a vein and is generally safe, though your care team checked for any allergies or kidney concerns beforehand.'
    });
  }

  if (bodyPart.toLowerCase().includes('brain')) {
    faqs.push(
      { q: 'What are ventricles?', a: 'Ventricles are normal fluid-filled spaces inside the brain. They produce and circulate cerebrospinal fluid (CSF), which cushions and protects the brain.' },
      { q: 'What is the difference between gray matter and white matter?', a: 'Gray matter is the outer layer of the brain where nerve cell bodies reside — it processes information. White matter is deeper and consists of nerve fibers that connect different brain regions, like wiring in a network.' }
    );
  } else if (bodyPart.toLowerCase().includes('spine') || bodyPart.toLowerCase().includes('lumbar')) {
    faqs.push(
      { q: 'What is a disc bulge or protrusion?', a: 'The discs between your vertebrae are like jelly-filled cushions. A bulge means the disc is pushing outward beyond its normal boundary. A protrusion is more focal. Not all bulges cause symptoms — many people have them without pain.' },
      { q: 'What is spinal stenosis?', a: 'Stenosis means narrowing. Spinal stenosis is when the canal that houses your spinal cord becomes narrower, potentially putting pressure on the nerves. It is commonly caused by age-related changes.' }
    );
  } else if (bodyPart.toLowerCase().includes('knee')) {
    faqs.push(
      { q: 'What is a meniscal tear?', a: 'The meniscus is a C-shaped piece of cartilage that cushions and stabilizes your knee. Tears can occur from injury or gradual wear. Small tears may heal with rest; larger tears might need minimally invasive surgery.' },
      { q: 'What does cartilage damage mean?', a: 'Articular cartilage is the smooth coating on the ends of bones in joints. Damage (chondromalacia) means this surface is softening or wearing thin, which can cause pain and stiffness. Early changes are common and manageable.' }
    );
  }

  if (hasReport && report && report.impression) {
    faqs.push({
      q: 'Should I be worried about the findings?',
      a: 'Many MRI findings are common and not necessarily cause for alarm. Your ordering physician knows your full medical history and symptoms, and is the best person to explain what these findings mean for you specifically. If you have concerns, do not hesitate to reach out to your doctor.'
    });
  }

  faqs.push({
    q: 'What should I do next?',
    a: 'Review these results and bring any questions to your next appointment with your doctor. They can explain the findings in the context of your symptoms and medical history, and recommend any next steps or treatments if needed.'
  });

  return faqs;
}

// Education
router.get('/education', requirePatient, (req, res) => {
  // Fetch unique test categories and tests the patient has had
  const patientTests = db.prepare(`
    SELECT DISTINCT tc.code, tc.name as test_name, tc.category, tc.unit,
      tc.reference_range_text, tc.description as test_description
    FROM test_results tr
    JOIN test_catalog tc ON tr.test_id = tc.id
    JOIN lab_orders lo ON tr.order_id = lo.id
    WHERE lo.patient_id = ?
    ORDER BY tc.category, tc.name
  `).all(req.session.patient.id);

  res.render('pages/portal/education', { patientTests });
});

module.exports = router;
