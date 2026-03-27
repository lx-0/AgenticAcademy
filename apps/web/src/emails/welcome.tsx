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

interface WelcomeEmailProps {
  name: string;
  dashboardUrl: string;
  firstCourseUrl?: string;
  firstCourseTitle?: string;
}

export function WelcomeEmail({
  name,
  dashboardUrl,
  firstCourseUrl,
  firstCourseTitle,
}: WelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Welcome to AgenticAcademy — your agentic AI journey starts here</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>Welcome to AgenticAcademy, {name}!</Heading>
          <Text style={text}>
            You're now part of a community transforming professional work through adaptive
            agentic learning. We're excited to have you here.
          </Text>
          <Text style={text}>
            <strong>Getting started:</strong>
          </Text>
          <Text style={text}>
            1. Complete your learner profile so we can personalise your path.<br />
            2. Explore our course catalogue and enrol in your first course.<br />
            3. Take the pre-assessment to capture your baseline skills.
          </Text>
          {firstCourseUrl && firstCourseTitle && (
            <Section style={buttonSection}>
              <Button href={firstCourseUrl} style={button}>
                Start: {firstCourseTitle}
              </Button>
            </Section>
          )}
          {!firstCourseUrl && (
            <Section style={buttonSection}>
              <Button href={dashboardUrl} style={button}>
                Go to your dashboard
              </Button>
            </Section>
          )}
          <Hr style={hr} />
          <Text style={footer}>AgenticAcademy · Unsubscribe from marketing emails in account settings</Text>
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
