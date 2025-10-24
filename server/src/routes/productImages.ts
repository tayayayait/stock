import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, constants as fsConstants } from 'node:fs';
import { access, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import fastifyMultipart from '@fastify/multipart';
import type { FastifyPluginAsync } from 'fastify';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png']);
const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
};

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

function resolveExtension(filename: string, mimetype: string): string {
  if (MIME_EXTENSION_MAP[mimetype]) {
    return MIME_EXTENSION_MAP[mimetype];
  }

  const ext = path.extname(filename).toLowerCase();
  if (ext === '.jpeg' || ext === '.jpg') {
    return '.jpg';
  }

  if (ext === '.png') {
    return '.png';
  }

  return '';
}

function resolveMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpeg' || ext === '.jpg') {
    return 'image/jpeg';
  }

  if (ext === '.png') {
    return 'image/png';
  }

  return 'application/octet-stream';
}

const productImagesRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fastifyMultipart, {
    limits: {
      fileSize: MAX_FILE_SIZE,
      files: 1,
    },
  });

  await mkdir(UPLOAD_DIR, { recursive: true });

  fastify.post('/', async (request, reply) => {
    const filePart = await request.file();
    if (!filePart) {
      return reply.code(400).send({ success: false, message: '이미지 파일이 필요합니다.' });
    }

    const { file, mimetype, filename } = filePart;

    if (!ALLOWED_MIME_TYPES.has(mimetype)) {
      file.resume();
      return reply
        .code(400)
        .send({ success: false, message: '지원하지 않는 이미지 형식입니다. JPG 또는 PNG 파일을 업로드해 주세요.' });
    }

    const extension = resolveExtension(filename, mimetype);
    if (!extension) {
      file.resume();
      return reply
        .code(400)
        .send({ success: false, message: '지원하지 않는 이미지 형식입니다. JPG 또는 PNG 파일을 업로드해 주세요.' });
    }

    const storedFileName = `${randomUUID()}${extension}`;
    const targetPath = path.join(UPLOAD_DIR, storedFileName);

    try {
      await pipeline(file, createWriteStream(targetPath));
    } catch (error) {
      await unlink(targetPath).catch(() => {});
      throw error;
    }

    if (file.truncated) {
      await unlink(targetPath).catch(() => {});
      return reply
        .code(400)
        .send({ success: false, message: '파일이 너무 큽니다. 최대 5MB까지 업로드할 수 있습니다.' });
    }

    reply.code(201);
    return { url: `/api/product-images/${storedFileName}` };
  });

  fastify.get('/:fileName', async (request, reply) => {
    const { fileName } = request.params as { fileName: string };
    const safeFileName = path.basename(fileName);
    const targetPath = path.join(UPLOAD_DIR, safeFileName);

    try {
      await access(targetPath, fsConstants.R_OK);
    } catch {
      return reply.code(404).send({ success: false, message: '요청하신 이미지를 찾을 수 없습니다.' });
    }

    reply.header('cache-control', 'public, max-age=31536000, immutable');
    reply.type(resolveMimeType(targetPath));
    return reply.send(createReadStream(targetPath));
  });
};

export default productImagesRoutes;
