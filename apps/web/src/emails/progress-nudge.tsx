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

interface ProgressNudgeEmailProps {
  name: string;
  courseTitle: string;
  resumeUrl: string;
  lastModuleTitle?: string;
}

export function ProgressNudgeEmail({
  name,
  courseTitle,
  resumeUrl,
  lastModuleTitle,
}: ProgressNudgeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Ready to continue {courseTitle}? Pick up where you left off.</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>Don't lose momentum, {name}!</Heading>
          <Text style={text}>
            It's been a while since you visited <strong>{courseTitle}</strong>. You're
            making great progress — keep it up!
          </Text>
          {lastModuleTitle && (
            <Text style={text}>
              You last worked on: <strong>{lastModuleTitle}</strong>
            </Text>
          )}
          <Section style={buttonSection}>
            <Button href={resumeUrl} style={button}>
              Continue learning
            </Button>
          </Section>
          <Hr style={hr} />
          <Text style={footer}>
            AgenticAcademy · To stop receiving nudge emails, update your preferences in
            account settings.
          </Text>
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
