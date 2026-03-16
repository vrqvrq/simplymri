// SimplyMRI LIS - Client-side JavaScript

// Highlight active nav link
document.addEventListener('DOMContentLoaded', function() {
  const path = window.location.pathname;
  const links = document.querySelectorAll('.nav-link');
  links.forEach(function(link) {
    if (path.startsWith(link.getAttribute('href'))) {
      link.style.background = 'rgba(255,255,255,0.1)';
      link.style.color = 'white';
      link.style.borderRight = '3px solid #60a5fa';
    }
  });
});
