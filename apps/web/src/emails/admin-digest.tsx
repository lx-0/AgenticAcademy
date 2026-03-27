import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Row,
  Column,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

interface LearnerProgress {
  name: string;
  email: string;
  activeEnrollments: number;
  completedThisWeek: number;
}

interface AdminDigestEmailProps {
  orgName: string;
  weekEnding: string;
  totalLearners: number;
  activeThisWeek: number;
  completionsThisWeek: number;
  learners: LearnerProgress[];
}

export function AdminDigestEmail({
  orgName,
  weekEnding,
  totalLearners,
  activeThisWeek,
  completionsThisWeek,
  learners,
}: AdminDigestEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Weekly team learning digest for {orgName} — week ending {weekEnding}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>{orgName} — Weekly Learning Digest</Heading>
          <Text style={text}>Week ending {weekEnding}</Text>
          <Section style={statsRow}>
            <Row>
              <Column align="center">
                <Text style={statNum}>{totalLearners}</Text>
                <Text style={statLabel}>Total learners</Text>
              </Column>
              <Column align="center">
                <Text style={statNum}>{activeThisWeek}</Text>
                <Text style={statLabel}>Active this week</Text>
              </Column>
              <Column align="center">
                <Text style={statNum}>{completionsThisWeek}</Text>
                <Text style={statLabel}>Completions</Text>
              </Column>
            </Row>
          </Section>
          {learners.length > 0 && (
            <>
              <Text style={{ ...text, fontWeight: "600", marginTop: "24px" }}>
                Team progress:
              </Text>
              {learners.map((l) => (
                <Row key={l.email} style={learnerRow}>
                  <Column>
                    <Text style={{ ...text, margin: "0", fontWeight: "500" }}>{l.name}</Text>
                    <Text style={{ fontSize: "12px", color: "#888", margin: "2px 0 0" }}>{l.email}</Text>
                  </Column>
                  <Column align="right">
                    <Text style={{ ...text, margin: "0" }}>
                      {l.activeEnrollments} active · {l.completedThisWeek} completed
                    </Text>
                  </Column>
                </Row>
              ))}
            </>
          )}
          <Hr style={hr} />
          <Text style={footer}>
            AgenticAcademy · To stop receiving weekly digests, update your admin preferences.
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
  maxWidth: "600px",
};
const heading = { fontSize: "22px", color: "#1a1a1a", marginBottom: "4px" };
const text = { fontSize: "15px", color: "#444", lineHeight: "1.6" };
const statsRow = {
  backgroundColor: "#f0f0ff",
  borderRadius: "8px",
  padding: "16px",
  margin: "16px 0",
};
const statNum = { fontSize: "32px", fontWeight: "700", color: "#6366f1", margin: "0", textAlign: "center" as const };
const statLabel = { fontSize: "12px", color: "#666", margin: "4px 0 0", textAlign: "center" as const };
const learnerRow = {
  borderBottom: "1px solid #f0f0f0",
  padding: "8px 0",
};
const hr = { borderColor: "#e0e0e0", margin: "24px 0" };
const footer = { fontSize: "12px", color: "#999" };
