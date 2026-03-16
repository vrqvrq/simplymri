# Deploy SimplyDiagnostic LIS to SiteGround

## Prerequisites
- SiteGround GoGeek or Cloud plan (SSH access required)
- SSH access enabled in SiteGround dashboard

## Step 1: Create Subdomain
1. Log in to SiteGround > **Websites** > **Site Tools**
2. Go to **Domain** > **Subdomains**
3. Create subdomain: `lis` (this creates `lis.simplydiagnostic.com`)

## Step 2: Enable SSH
1. In Site Tools > **Devs** > **SSH Keys Manager**
2. Generate or import your SSH key
3. Note your SSH credentials (shown in the dashboard)

## Step 3: Upload and Install
SSH into your SiteGround server:

```bash
ssh your-user@your-server.siteground.biz

# Navigate to the subdomain folder
cd ~/www/lis.simplydiagnostic.com/public_html

# Upload files (from your local machine, run this instead):
# scp -r ./* your-user@your-server.siteground.biz:~/www/lis.simplydiagnostic.com/public_html/

# Install dependencies
npm install --production

# Set up the database
mkdir -p data
npm run setup

# Install PM2 globally
npm install -g pm2

# Start the app
pm2 start ecosystem.config.js

# Save PM2 process list (auto-restart on reboot)
pm2 save
pm2 startup
```

## Step 4: Set Up Reverse Proxy
Create or edit `.htaccess` in the subdomain's `public_html`:

```apache
RewriteEngine On
RewriteRule ^(.*)$ http://localhost:3000/$1 [P,L]
```

If `.htaccess` proxy doesn't work on your plan, contact SiteGround support
to set up a reverse proxy from port 443 to localhost:3000.

## Step 5: Verify
Visit `https://lis.simplydiagnostic.com`
- Login: `admin` / `admin123`
- **Change the admin password immediately** in Settings

## Updating the App
```bash
ssh your-user@your-server.siteground.biz
cd ~/www/lis.simplydiagnostic.com/public_html
# Upload new files, then:
npm install --production
pm2 restart simplydiagnostic-lis
```
