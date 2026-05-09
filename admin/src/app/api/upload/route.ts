import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
const MAX_SIZE = 5 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: 'Only image files allowed' }, { status: 400 });
    if (file.size > MAX_SIZE) return NextResponse.json({ error: 'Max 5 MB' }, { status: 400 });

    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      console.log('[upload] Creating upload directory:', uploadDir);
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const ext = path.extname(file.name) || '.jpg';
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    const filePath = path.join(uploadDir, fileName);
    
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    await fs.promises.writeFile(filePath, buffer);
    console.log('[upload] File saved to:', filePath);

    return NextResponse.json({ 
      url: `/uploads/${fileName}`,
      success: 1, // Added for EditorJS compatibility
      file: {
        url: `/uploads/${fileName}`
      }
    });
  } catch (err: any) {
    console.error('[upload] Error during upload:', err);
    return NextResponse.json({ 
      error: 'Upload failed', 
      message: err.message,
      success: 0 
    }, { status: 500 });
  }
}
