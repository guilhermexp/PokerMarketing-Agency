#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const sharpImgDir = path.join(projectRoot, 'node_modules', 'sharp', 'node_modules', '@img');
const targetDir = path.join(projectRoot, 'node_modules', '@img', 'sharp-libvips-darwin-arm64');
const linkPath = path.join(sharpImgDir, 'sharp-libvips-darwin-arm64');

function isDarwinArm64() {
  return process.platform === 'darwin' && process.arch === 'arm64';
}

function ensureLink() {
  if (!isDarwinArm64()) return;
  if (!fs.existsSync(sharpImgDir)) return;
  if (!fs.existsSync(targetDir)) return;

  const relativeTarget = path.relative(sharpImgDir, targetDir) || '.';

  try {
    if (fs.existsSync(linkPath)) {
      const stat = fs.lstatSync(linkPath);
      if (stat.isSymbolicLink()) {
        const current = fs.readlinkSync(linkPath);
        if (current === relativeTarget) {
          return;
        }
      }
      fs.rmSync(linkPath, { recursive: true, force: true });
    }

    fs.symlinkSync(relativeTarget, linkPath, 'dir');
    console.log('[sharp-fix] linked', linkPath, '->', relativeTarget);
  } catch (error) {
    console.warn('[sharp-fix] unable to create sharp libvips symlink:', error?.message || error);
  }
}

ensureLink();
