# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please follow these steps:

### Do NOT

- Open a public GitHub issue for security vulnerabilities
- Share vulnerability details publicly before they are fixed

### Do

1. **Email** security concerns to: security@microsoft.com
2. **Include** the following information:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Any suggested fixes

### What to Expect

- **Acknowledgment**: Within 24-48 hours
- **Initial Assessment**: Within 5 business days
- **Resolution Timeline**: Depends on severity
  - Critical: 7 days
  - High: 14 days
  - Medium: 30 days
  - Low: 60 days

## Security Best Practices for Deployment

### Environment Variables

Never commit sensitive data. Use environment variables:

```bash
# .env (never commit this file)
FOUNDRY_API_KEY=your_key_here
DATABASE_URL=your_connection_string
```

### API Security

- Enable CORS restrictions in production
- Use HTTPS in production
- Implement rate limiting
- Validate all user inputs

### Authentication

This demo does not include authentication. For production:

- Implement JWT or OAuth2
- Use secure session management
- Enable MFA where appropriate

### Data Protection

- Encrypt sensitive data at rest
- Use TLS for data in transit
- Implement proper access controls
- Log security events

## Security Features

### Current Implementation

- Input validation on API endpoints
- WebSocket message validation
- Safe JSON parsing

### Recommended Additions for Production

- Authentication/Authorization
- Rate limiting
- Request logging and monitoring
- SQL injection prevention (if using database)
- XSS protection headers

## Dependency Security

We regularly update dependencies. To check for vulnerabilities:

```bash
npm audit
```

To fix automatically:

```bash
npm audit fix
```

## Contact

- **Security Issues**: security@microsoft.com
- **General Questions**: Open a GitHub issue

Thank you for helping keep this project secure!
