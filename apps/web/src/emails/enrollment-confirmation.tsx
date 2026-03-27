import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

interface EnrollmentConfirmationEmailProps {
  name: string;
  courseTitle: string;
  preAssessmentUrl: string;
}

export function EnrollmentConfirmationEmail({
  name,
  courseTitle,
  preAssessmentUrl,
}: EnrollmentConfirmationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>You're enrolled in {courseTitle} — take your pre-assessment</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>You're enrolled, {name}!</Heading>
          <Text style={text}>
            Great news — you're now enrolled in <strong>{courseTitle}</strong>.
          </Text>
          <Text style={text}>
            Before you dive in, complete the <strong>pre-assessment</strong> to capture your
            baseline skill level. This takes about 5 minutes and helps us personalise your
            learning path.
          </Text>
          <Section style={buttonSection}>
            <Button href={preAssessmentUrl} style={button}>
              Take pre-assessment
            </Button>
          </Section>
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
const button = {
  backgroundColor: "#6366f1",
  color: "#fff",
  padding: "12px 24px",
  borderRadius: "6px",
  fontWeight: "600",
  fontSize: "15px",
  textDecoration: "none",
};
const hr = { borderColor: "#e0e0e0", margin: "24px 0" };
const footer = { fontSize: "12px", color: "#999" };
