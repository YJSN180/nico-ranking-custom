# GitHub Security Guide for Public Repositories

## Overview

This guide explains security best practices for managing sensitive information in public GitHub repositories. Following these practices is crucial to prevent unauthorized access to your services and protect your infrastructure.

## Key Security Principles

### 1. Never Commit Secrets to Git

**CRITICAL**: Never commit sensitive information directly to your repository, even temporarily. This includes:

- API keys and tokens
- Database credentials
- Private keys and certificates
- Service account credentials
- Webhook URLs with embedded secrets
- Any form of authentication credentials

### 2. Why This Matters

- **Public Repository Visibility**: Every commit in a public repository is permanently visible to anyone on the internet
- **Git History**: Even if you delete a file containing secrets, the information remains in git history
- **Automated Scanners**: Malicious actors use automated tools to scan GitHub for exposed credentials
- **Immediate Exploitation**: Exposed credentials can be found and exploited within minutes

## Environment Variables Best Practices

### Local Development

1. **Use `.env.local` files**:
   ```bash
   # .env.local (NEVER commit this file)
   CLOUDFLARE_KV_API_TOKEN=your_actual_token_here
   CRON_SECRET=your_actual_secret_here
   ```

2. **Create `.env.example` files**:
   ```bash
   # .env.example (safe to commit)
   CLOUDFLARE_KV_API_TOKEN=your_cloudflare_api_token
   CRON_SECRET=your_secure_cron_secret
   ```

3. **Ensure `.gitignore` includes**:
   ```gitignore
   .env*.local
   .env
   *.env
   ```

### Production Deployment

1. **Vercel Environment Variables**:
   - Set via Vercel Dashboard → Settings → Environment Variables
   - Never expose these in build logs or client-side code

2. **GitHub Secrets** (for GitHub Actions):
   - Set via Repository → Settings → Secrets and variables → Actions
   - Reference in workflows: `${{ secrets.YOUR_SECRET_NAME }}`

3. **Cloudflare Workers**:
   - Use `wrangler secret put` for sensitive values
   - Never commit `.dev.vars` files

## Security Checklist

### Before Every Commit

- [ ] Check for hardcoded credentials in your changes
- [ ] Ensure no `.env` or `.env.local` files are being committed
- [ ] Review all configuration files for sensitive data
- [ ] Verify example files contain only placeholder values

### Repository Setup

- [ ] `.gitignore` properly configured to exclude all env files
- [ ] `.env.example` files contain only safe placeholder text
- [ ] README/documentation doesn't contain real credentials
- [ ] No sensitive data in issue comments or PR descriptions

### If Credentials Are Exposed

1. **Immediately revoke/rotate the exposed credentials**
2. **Generate new credentials from the service provider**
3. **Update all applications using the credentials**
4. **Review access logs for unauthorized usage**
5. **Consider using `git filter-branch` or BFG Repo-Cleaner to remove from history**

## Service-Specific Security

### Cloudflare KV

- API tokens should have minimal required permissions
- Use scoped tokens limited to specific namespaces
- Rotate tokens periodically

### Vercel KV

- Use read-only tokens where possible
- Monitor usage for unusual patterns
- Set up alerts for quota limits

### CRON_SECRET

- Use cryptographically secure random values
- Minimum 32 characters recommended
- Rotate periodically
- Never reuse across environments

## Additional Security Measures

1. **Enable GitHub Secret Scanning**:
   - GitHub automatically scans for known credential patterns
   - Enable push protection to prevent accidental commits

2. **Use Environment-Specific Secrets**:
   - Different values for development, staging, and production
   - Prevents accidental production access from development

3. **Implement Secret Rotation**:
   - Regular rotation schedule (e.g., every 90 days)
   - Document rotation procedures
   - Test rotation in non-production first

4. **Audit Access**:
   - Regularly review who has access to secrets
   - Remove access for former team members
   - Use principle of least privilege

## Common Mistakes to Avoid

1. **Committing then deleting**: The secret remains in git history
2. **Using weak placeholder values**: Attackers might guess common patterns
3. **Logging secrets**: Ensure logs don't contain sensitive data
4. **Client-side exposure**: Never send secrets to the browser
5. **Insufficient `.gitignore`**: Double-check all patterns are covered

## Tools and Resources

- **GitHub Secret Scanning**: Built-in detection for exposed credentials
- **git-secrets**: Pre-commit hook to prevent secret commits
- **truffleHog**: Scans repository history for secrets
- **BFG Repo-Cleaner**: Removes sensitive data from git history

## Remember

Security is everyone's responsibility. When in doubt, ask for help before committing potentially sensitive information. It's much easier to prevent exposure than to clean up after it.