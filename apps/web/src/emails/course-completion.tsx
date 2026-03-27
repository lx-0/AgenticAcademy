import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Row,
  Column,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

interface CourseCompletionEmailProps {
  name: string;
  courseTitle: string;
  certificateUrl: string;
  credentialId: string;
  linkedInShareUrl: string;
  dashboardUrl: string;
}

export function CourseCompletionEmail({
  name,
  courseTitle,
  certificateUrl,
  credentialId,
  linkedInShareUrl,
  dashboardUrl,
}: CourseCompletionEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Congratulations! You completed {courseTitle} and earned your certificate.</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>Congratulations, {name}!</Heading>
          <Text style={text}>
            You've completed <strong>{courseTitle}</strong> and earned your certificate. This
            is a real achievement — well done!
          </Text>
          <Text style={text}>
            Credential ID: <strong>{credentialId}</strong>
          </Text>
          <Section style={buttonSection}>
            <Button href={certificateUrl} style={primaryButton}>
              Download certificate
            </Button>
          </Section>
          <Section style={{ margin: "0 0 24px" }}>
            <Row>
              <Column align="center">
                <Link href={linkedInShareUrl} style={linkedInLink}>
                  Share on LinkedIn
                </Link>
              </Column>
            </Row>
          </Section>
          <Text style={text}>
            Ready for your next challenge?{" "}
            <Link href={dashboardUrl} style={link}>
              Explore more courses
            </Link>
          </Text>
          <Hr style={hr} />
          <Text style={footer}>AgenticAcademy · Manage email preferences in account settings</Text>
        </Container>
      </Body>
    </Html>
  );
}

const body = { backgroundColor: "#f6f9fc", fontFamily: "sans-serif" };
const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "32px",
  borderRadius: "8px",
  maxWidth: "560px",
};
const heading = { fontSize: "24px", color: "#1a1a1a", marginBottom: "16px" };
const text = { fontSize: "15px", color: "#444", lineHeight: "1.6" };
const buttonSection = { textAlign: "center" as const, margin: "24px 0" };
const primaryButton = {
  backgroundColor: "#6366f1",
  color: "#fff",
  padding: "12px 24px",
  borderRadius: "6px",
  fontWeight: "600",
  fontSize: "15px",
  textDecoration: "none",
};
const linkedInLink = {
  backgroundColor: "#0a66c2",
  color: "#fff",
  padding: "10px 20px",
  borderRadius: "6px",
  fontWeight: "600",
  fontSize: "14px",
  textDecoration: "none",
};
const link = { color: "#6366f1" };
const hr = { borderColor: "#e0e0e0", margin: "24px 0" };
const footer = { fontSize: "12px", color: "#999" };
