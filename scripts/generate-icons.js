// PWA用アイコン生成スクリプト
// このスクリプトはog-image.pngから必要なサイズのアイコンを生成します
// 実行にはsharpパッケージが必要です: npm install --save-dev sharp

import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function generateIcons() {
  const inputPath = path.join(__dirname, '../public/og-image.png');
  const sizes = [
    { size: 192, name: 'icon-192.png' },
    { size: 512, name: 'icon-512.png' },
    { size: 180, name: 'apple-touch-icon.png' }, // iOS用
    { size: 32, name: 'favicon-32x32.png' },
    { size: 16, name: 'favicon-16x16.png' },
  ];

  try {
    // 入力画像の存在確認
    await fs.access(inputPath);
    
    // 各サイズのアイコンを生成
    for (const { size, name } of sizes) {
      const outputPath = path.join(__dirname, '../public', name);
      
      await sharp(inputPath)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 128, b: 255, alpha: 1 } // #0080ff
        })
        .png()
        .toFile(outputPath);
      
      console.log(`Generated ${name} (${size}x${size})`);
    }
    
    console.log('All icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
    console.log('Please ensure og-image.png exists in the public directory');
  }
}

generateIcons();