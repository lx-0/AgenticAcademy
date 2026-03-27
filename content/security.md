# Security & Data Handling

**AgenticAcademy** | Public Security Documentation
*Last updated: March 25, 2026 · Version 1.0*

---

This page is designed to be shared with your IT security, legal, and compliance teams during procurement review. No login required. If you have questions not answered here, contact us at **security@agenticacademy.com**.

---

## Quick Reference

| Topic | Summary |
|-------|---------|
| Data residency | United States (Railway / AWS us-east) |
| Personal data stored | Learner profile, progress, assessment scores |
| Company data accessed | **None** — we never access your systems |
| Third-party LLM usage | Anthropic Claude API (content generation only) |
| Encryption in transit | TLS 1.2+ (HTTPS everywhere) |
| Encryption at rest | AES-256 (database and file storage) |
| GDPR | Compliant — data processing agreement available |
| CCPA | Compliant — privacy policy addresses California rights |
| SOC 2 | In progress — Type II audit scheduled Q3 2026 |
| Data deletion | Honored within 30 days of request |

---

## 1. What Data We Collect

### Learner Data

When an individual creates an account and uses AgenticAcademy, we collect:

- **Account data**: Name, email address, job title, company name (optional)
- **Authentication data**: Hashed passwords (bcrypt) or OAuth tokens — plaintext passwords are never stored
- **Learning activity**: Modules viewed, time on task, quiz responses, lab submissions, assessment scores, completion status
- **Preferences and settings**: Notification preferences, display settings, learning path customizations

### What We Do Not Collect

- Your company's source code, infrastructure, or proprietary data
- Credentials for your internal systems
- Data from your production agent deployments
- Any data from systems outside the AgenticAcademy platform
- Content of private communications within your organization

---

## 2. Agent Data Isolation (Critical for Enterprise Buyers)

**AgenticAcademy is a learning platform. It does not connect to, access, monitor, or process any of your company's internal systems, agents, code repositories, or infrastructure.**

Our platform uses AI agents internally to:
- Generate personalized quiz questions
- Adapt learning path recommendations
- Synthesize course summaries

These internal agents operate exclusively on content within our platform. They:
- Have no internet access or ability to access external URLs you provide
- Cannot call your APIs or access your databases
- Cannot read from or write to any system outside AgenticAcademy
- Do not retain learner responses as training data for our models

**When an engineer completes a lab on "debugging a multi-agent pipeline," that lab runs in a fully sandboxed environment we provide — it has no connection to your company's infrastructure.**

---

## 3. How We Use Your Data

### Purposes

| Data Type | How We Use It |
|-----------|--------------|
| Account information | Authentication, account management, support |
| Learning activity | Progress tracking, adaptive recommendations, completion certificates |
| Assessment scores | Skill measurement, ROI reporting (admin dashboard), certificate issuance |
| Aggregated usage data | Platform improvement, anonymous benchmarking |

### What We Do Not Do

- We do not sell learner data to third parties
- We do not share individual learner data with other employers or organizations
- We do not use learner content or quiz responses to train AI models
- We do not use assessment scores for employment decisions (we have no ability to do so — this data is available only to the individual learner and their designated admin)

---

## 4. Data Sharing with Third Parties

We share data with the following third-party services, limited to the stated purposes:

| Service | Data Shared | Purpose | Location |
|---------|-------------|---------|---------|
| **Railway** (hosting) | All platform data (encrypted) | Infrastructure hosting | United States |
| **Cloudflare R2** | Course media files | File storage and delivery | United States / CDN edge |
| **Anthropic** | Learner-submitted quiz responses, course content queries | AI content generation and personalization | United States |
| **Stripe** (future) | Billing information | Payment processing | United States |

### Anthropic Data Usage

Our platform calls the Anthropic Claude API to power adaptive quiz generation and learning recommendations. When a learner interacts with an AI-powered feature:

- We send the minimum context required for the task (e.g., a quiz question request, not the learner's full history)
- We do not send learner names, email addresses, or personally identifiable information to Anthropic
- Anthropic's API is used for real-time inference; we do not use the API in training data submission mode
- Anthropic's data usage policies apply: [anthropic.com/privacy](https://anthropic.com/privacy)

---

## 5. Data Residency

**All primary data is stored in the United States.**

| Data Type | Storage Location | Provider |
|-----------|-----------------|---------|
| Learner accounts and progress | PostgreSQL on Railway | Railway (us-east) |
| Session data | Redis on Railway | Railway (us-east) |
| Course media (videos, PDFs) | Cloudflare R2 | US-East primary; CDN edge for delivery |

We do not currently offer EU or other regional data residency. Organizations with mandatory EU data residency requirements should contact us at **security@agenticacademy.com** — we are evaluating EU region support for Q4 2026.

---

## 6. Encryption

### In Transit

- All communication between learners and AgenticAcademy uses **TLS 1.2 or TLS 1.3**
- HTTPS is enforced everywhere — HTTP requests are redirected to HTTPS
- Internal service-to-service communication within our Railway infrastructure uses TLS
- We use HSTS (HTTP Strict Transport Security) headers

### At Rest

- **PostgreSQL database**: Encrypted at rest using AES-256 (Railway managed)
- **File storage (Cloudflare R2)**: Encrypted at rest using AES-256
- **Session data (Redis)**: Encrypted at rest
- **Passwords**: Hashed using bcrypt (never stored in plaintext)
- **OAuth tokens**: Stored encrypted, rotated on each session

---

## 7. Access Controls

### Platform Access

- Authentication is handled by NextAuth.js (self-hosted; no third-party auth vendor)
- Supported authentication methods:
  - Email + password (bcrypt hashed)
  - OAuth via Google, GitHub, LinkedIn
  - SSO via SAML 2.0 / OIDC (Enterprise plan)
- Multi-factor authentication (MFA): Available and recommended for admin accounts; optional for individual learners

### Role-Based Access

| Role | Access |
|------|--------|
| Learner | Own progress, own assessment scores, own certificates |
| Team Admin | Team members' progress and completion data; cannot view individual quiz responses |
| L&D Admin | All learner data within purchased seats; aggregate skills dashboards; cannot export raw responses |
| Billing Admin | Subscription and payment information only |

Admins can access aggregate skill measurement data and completion status. **Individual quiz and assessment responses are not exportable in bulk** — they are private to the learner.

### Our Internal Access Controls

- Production database access is restricted to fewer than 3 personnel; access is logged
- Customer data is accessible to support staff only on a need-to-know basis, with audit trail
- All internal access to customer data is logged and reviewed quarterly
- We follow the principle of least privilege for all internal systems

---

## 8. Data Retention and Deletion

### Default Retention

| Data Type | Retention Period |
|-----------|----------------|
| Account and profile data | Retained while account is active + 90 days after deletion request |
| Learning progress and history | Retained while account is active + 90 days after deletion request |
| Assessment scores | Retained while account is active + 90 days after deletion request |
| Certificates | Available for 3 years after issuance (for credential verification) |
| Billing records | 7 years (legal/tax requirement) |
| Server logs | 90 days |
| Anonymized aggregate usage data | Indefinitely (no personal identifiers) |

### Deletion Requests

- **Individual learners** can delete their account and all associated data from Account Settings
- **Enterprise admins** can request bulk deletion of all data associated with their organization's seats
- We honor all deletion requests within **30 days**
- Upon deletion, personal data is permanently removed from production systems; anonymized aggregates (if applicable) are retained

---

## 9. GDPR Compliance

AgenticAcademy processes personal data of individuals in the European Union. Our GDPR commitments:

**Lawful basis for processing**: We process learner data under legitimate interest (providing the contracted learning service) and, where required, explicit consent.

**Data subject rights we honor**:
- **Right of access**: Learners can export their data from Account Settings
- **Right to rectification**: Learners can update their profile and data at any time
- **Right to erasure**: Honored within 30 days via account deletion
- **Right to portability**: Learning history and assessment scores are exportable in JSON format
- **Right to object**: Contact us at privacy@agenticacademy.com

**Data Processing Agreement (DPA)**: A Data Processing Agreement is available for enterprise customers upon request. Email **legal@agenticacademy.com**.

**Data transfers**: Data is stored in the United States. Transfers from the EU to the US rely on Standard Contractual Clauses (SCCs). Updated SCCs are available in our DPA.

---

## 10. CCPA Compliance

For California residents:

- We do not sell personal information as defined by CCPA
- California residents have the right to know what personal information we collect, to delete it, and to opt out of sale (we do not sell)
- To exercise CCPA rights: email **privacy@agenticacademy.com** or use the deletion flow in Account Settings

---

## 11. SOC 2 Compliance

**Current status**: SOC 2 Type II audit is scheduled for Q3 2026.

We are building our security program to SOC 2 Type II standards across the Trust Service Criteria: Security, Availability, Confidentiality, and Privacy. Our security controls are designed to meet these criteria today; the formal audit will confirm and certify them.

**What we have in place today**:
- Documented information security policies
- Access control procedures and quarterly reviews
- Incident response plan
- Change management procedures (all code changes go through CI/CD with automated testing; no direct production access)
- Vendor risk management program
- Security awareness training for all staff

Enterprise customers who require SOC 2 Type II before signing can contact us to discuss a timeline and any compensating controls documentation we can provide in the interim.

---

## 12. Incident Response

In the event of a security incident affecting customer data:

- We will notify affected enterprise customers within **72 hours** of confirmed breach discovery (meeting GDPR notification requirements)
- Notification will include: nature of the incident, data affected, steps taken, and remediation status
- Individual learners will be notified if their personal data is affected
- We maintain an incident response runbook and conduct tabletop exercises annually

To report a security vulnerability, email **security@agenticacademy.com**.

---

## 13. Penetration Testing and Vulnerability Management

- External penetration testing is scheduled bi-annually
- We operate a responsible disclosure program — to report a vulnerability, contact **security@agenticacademy.com**
- Critical vulnerabilities are patched within 24 hours; high severity within 7 days; medium within 30 days
- Dependencies are monitored for known vulnerabilities via automated scanning in CI/CD

---

## 14. Enterprise SSO and Team Management

Enterprise plans include:

- **SAML 2.0 / OIDC SSO**: Connect your identity provider (Okta, Azure AD, Google Workspace) — learners authenticate with their corporate credentials
- **SCIM provisioning** (Q3 2026): Automated user lifecycle management — provision and deprovision seats as employees join or leave
- **Team-based access controls**: Admins can assign specific course tracks to specific teams and restrict access to team-relevant content
- **Audit logs**: Admin actions (enrollment changes, seat assignments, exports) are logged and available to your L&D admin

---

## 15. Frequently Asked Questions

**Does AgenticAcademy access our company's systems or data?**
No. We have no integration with your internal systems. Course labs run in sandboxed environments we provide. No data flows from your infrastructure to our platform.

**Can our employees' quiz responses be seen by their manager?**
No. Individual quiz responses and assessment answers are private to the learner. Admins and L&D managers can see completion status and aggregate skill scores, but not individual question-level responses.

**Does using the AI-powered features send our data to OpenAI or other AI providers?**
We use Anthropic's Claude API exclusively. We do not use OpenAI. When a learner uses an AI-powered feature (adaptive recommendations, AI quiz generation), we send the minimum necessary context to Anthropic — not personally identifiable information. See Section 4 for details.

**What happens to our data if we cancel our subscription?**
Account and learning data is retained for 90 days after subscription end, during which you can export data. After 90 days, it is permanently deleted (except billing records retained for legal compliance).

**Do you offer a Business Associate Agreement (BAA) for HIPAA-covered entities?**
Healthcare organizations with HIPAA obligations should contact **legal@agenticacademy.com** before purchasing. AgenticAcademy is not currently a HIPAA Business Associate and does not store Protected Health Information.

**Can we host AgenticAcademy on our own infrastructure?**
Self-hosted / private cloud deployment is available for Enterprise contracts. Contact **sales@agenticacademy.com** to discuss requirements.

**Where can I find your privacy policy?**
Full privacy policy: [agenticacademy.com/privacy](https://agenticacademy.com/privacy)

---

## Contact

| Purpose | Contact |
|---------|---------|
| Security questions and vulnerability reports | security@agenticacademy.com |
| Privacy rights and GDPR/CCPA requests | privacy@agenticacademy.com |
| Data Processing Agreement requests | legal@agenticacademy.com |
| Enterprise security review meetings | sales@agenticacademy.com |

For security-critical matters, we respond within 24 business hours.

---

*This page is reviewed and updated quarterly. Significant changes will be announced to enterprise customers via email.*

*AgenticAcademy · [agenticacademy.com](https://agenticacademy.com) · March 2026*
