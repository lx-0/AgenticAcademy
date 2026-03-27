import {
  Body,
  Button,
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

interface SkillScore {
  skillName: string;
  preScore: number;
  postScore: number;
}

interface AssessmentResultsEmailProps {
  name: string;
  courseTitle: string;
  preOverall: number;
  postOverall: number;
  skillScores: SkillScore[];
  dashboardUrl: string;
}

export function AssessmentResultsEmail({
  name,
  courseTitle,
  preOverall,
  postOverall,
  skillScores,
  dashboardUrl,
}: AssessmentResultsEmailProps) {
  const improvement = postOverall - preOverall;
  const improvementStr = improvement >= 0 ? `+${improvement}` : `${improvement}`;

  return (
    <Html>
      <Head />
      <Preview>Your skill improvement results for {courseTitle} are in!</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>Your results are in, {name}!</Heading>
          <Text style={text}>
            Here's how your skills improved through <strong>{courseTitle}</strong>:
          </Text>
          <Section style={scoreBox}>
            <Row>
              <Column align="center">
                <Text style={scoreLabel}>Before</Text>
                <Text style={scoreValue}>{preOverall}%</Text>
              </Column>
              <Column align="center">
                <Text style={scoreLabel}>After</Text>
                <Text style={scoreValue}>{postOverall}%</Text>
              </Column>
              <Column align="center">
                <Text style={scoreLabel}>Improvement</Text>
                <Text style={{ ...scoreValue, color: improvement >= 0 ? "#16a34a" : "#dc2626" }}>
                  {improvementStr}%
                </Text>
              </Column>
            </Row>
          </Section>
          {skillScores.length > 0 && (
            <>
              <Text style={{ ...text, fontWeight: "600", marginTop: "16px" }}>
                Skill breakdown:
              </Text>
              {skillScores.map((s) => {
                const delta = s.postScore - s.preScore;
                const deltaStr = delta >= 0 ? `+${delta}` : `${delta}`;
                return (
                  <Row key={s.skillName} style={{ marginBottom: "8px" }}>
                    <Column>
                      <Text style={{ ...text, margin: 0 }}>{s.skillName}</Text>
                    </Column>
                    <Column align="right">
                      <Text style={{ ...text, margin: 0, color: delta >= 0 ? "#16a34a" : "#dc2626" }}>
                        {s.preScore}% → {s.postScore}% ({deltaStr}%)
                      </Text>
                    </Column>
                  </Row>
                );
              })}
            </>
          )}
          <Section style={buttonSection}>
            <Button href={dashboardUrl} style={button}>
              View your dashboard
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
const scoreBox = {
  backgroundColor: "#f0f0ff",
  borderRadius: "8px",
  padding: "16px",
  margin: "16px 0",
};
const scoreLabel = { fontSize: "12px", color: "#666", margin: "0 0 4px", textAlign: "center" as const };
const scoreValue = { fontSize: "28px", fontWeight: "700", color: "#1a1a1a", margin: "0", textAlign: "center" as const };
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
