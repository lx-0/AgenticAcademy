import * as React from "react";
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Heading,
  Link,
  Hr,
  Preview,
} from "@react-email/components";

interface NpsSurveyEmailProps {
  name: string;
  courseTitle: string;
  surveyUrl: string;
}

export function NpsSurveyEmail({ name, courseTitle, surveyUrl }: NpsSurveyEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>How was {courseTitle}? Share your feedback in 2 minutes.</Preview>
      <Body style={{ backgroundColor: "#f9fafb", fontFamily: "sans-serif" }}>
        <Container style={{ maxWidth: 600, margin: "40px auto", padding: "0 24px" }}>
          <Section style={{ backgroundColor: "#fff", borderRadius: 12, padding: 40, border: "1px solid #e5e7eb" }}>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ display: "inline-block", width: 48, height: 48, borderRadius: 10, backgroundColor: "#4f46e5", lineHeight: "48px", textAlign: "center" }}>
                <span style={{ color: "#fff", fontWeight: "bold", fontSize: 18 }}>AA</span>
              </div>
            </div>

            <Heading style={{ fontSize: 22, fontWeight: 700, color: "#111827", textAlign: "center", margin: "0 0 8px" }}>
              How did we do?
            </Heading>
            <Text style={{ color: "#6b7280", textAlign: "center", margin: "0 0 32px" }}>
              Congratulations on completing <strong>{courseTitle}</strong>, {name}!
            </Text>

            <Text style={{ color: "#374151", lineHeight: 1.6 }}>
              We&apos;d love your honest feedback — it takes about 2 minutes and helps us improve the experience for everyone.
            </Text>

            <Section style={{ textAlign: "center", margin: "32px 0" }}>
              <Link
                href={surveyUrl}
                style={{
                  display: "inline-block",
                  backgroundColor: "#4f46e5",
                  color: "#fff",
                  padding: "14px 32px",
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 15,
                  textDecoration: "none",
                }}
              >
                Share your feedback →
              </Link>
            </Section>

            <Text style={{ color: "#9ca3af", fontSize: 13, textAlign: "center" }}>
              Your feedback is anonymous and helps us build a better learning platform.
            </Text>

            <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />
            <Text style={{ color: "#9ca3af", fontSize: 12, textAlign: "center" }}>
              AgenticAcademy · You can unsubscribe from feedback requests in your account settings.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
