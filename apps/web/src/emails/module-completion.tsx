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

interface ModuleCompletionEmailProps {
  name: string;
  moduleTitle: string;
  nextModuleTitle?: string;
  nextModuleUrl?: string;
  courseUrl: string;
}

export function ModuleCompletionEmail({
  name,
  moduleTitle,
  nextModuleTitle,
  nextModuleUrl,
  courseUrl,
}: ModuleCompletionEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Module complete: {moduleTitle} — keep the momentum going!</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>Nice work, {name}!</Heading>
          <Text style={text}>
            You just completed <strong>{moduleTitle}</strong>. Great progress!
          </Text>
          {nextModuleTitle && nextModuleUrl ? (
            <>
              <Text style={text}>
                Up next: <strong>{nextModuleTitle}</strong>
              </Text>
              <Section style={buttonSection}>
                <Button href={nextModuleUrl} style={button}>
                  Start next module
                </Button>
              </Section>
            </>
          ) : (
            <>
              <Text style={text}>
                You're close to finishing the course. Head back to complete the remaining
                modules!
              </Text>
              <Section style={buttonSection}>
                <Button href={courseUrl} style={button}>
                  Continue course
                </Button>
              </Section>
            </>
          )}
          <Hr style={hr} />
          <Text style={footer}>
            AgenticAcademy · To stop receiving these emails, update your preferences in
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
