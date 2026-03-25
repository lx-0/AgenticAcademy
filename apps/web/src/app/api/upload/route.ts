import { auth } from "@/auth";
import { NextResponse } from "next/server";
import {
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function getS3Client(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Only PDF and image files are accepted" },
      { status: 400 }
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File exceeds 10 MB limit" },
      { status: 400 }
    );
  }

  const ext = file.name.split(".").pop() ?? "bin";
  const key = `credential-submissions/${session.user.id}/${randomUUID()}.${ext}`;

  try {
    const s3 = getS3Client();
    const bytes = await file.arrayBuffer();

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: key,
        Body: Buffer.from(bytes),
        ContentType: file.type,
        ContentDisposition: `attachment; filename="${file.name}"`,
      })
    );

    const url = `https://${process.env.R2_BUCKET_NAME}.r2.dev/${key}`;
    return NextResponse.json({ url });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json(
      { error: "Upload failed — please try again" },
      { status: 500 }
    );
  }
}
