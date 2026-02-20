/**
 * Image Preprocessing Utilities
 * Compresses and optimizes images BEFORE sending to AI
 * Reduces token consumption by ~40-60%
 */

export interface ProcessedImage {
  base64: string;
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
}

export interface ImageProcessingOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
}

const DEFAULT_OPTIONS: ImageProcessingOptions = {
  maxWidth: 1200,    // Optimal for OCR without excess tokens
  maxHeight: 1600,
  quality: 0.85,     // Good balance between quality and size
  format: 'jpeg'
};

/**
 * Compresses and resizes an image for optimal AI processing
 */
export async function processImage(
  base64Data: string,
  options: ImageProcessingOptions = {}
): Promise<ProcessedImage> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    img.onload = () => {
      try {
        // Calculate new dimensions maintaining aspect ratio
        let { width, height } = img;
        const aspectRatio = width / height;

        if (width > opts.maxWidth!) {
          width = opts.maxWidth!;
          height = width / aspectRatio;
        }
        if (height > opts.maxHeight!) {
          height = opts.maxHeight!;
          width = height * aspectRatio;
        }

        // Create canvas and draw resized image
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width);
        canvas.height = Math.round(height);
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Failed to get canvas context');
        }

        // Apply image smoothing for better OCR results
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // Draw the image
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Apply contrast enhancement for better OCR
        enhanceContrast(ctx, canvas.width, canvas.height);

        // Convert to compressed format
        const mimeType = `image/${opts.format}`;
        const compressedBase64 = canvas.toDataURL(mimeType, opts.quality);

        // Calculate sizes
        const originalSize = Math.round((base64Data.length * 3) / 4);
        const compressedSize = Math.round((compressedBase64.length * 3) / 4);

        resolve({
          base64: compressedBase64,
          width: canvas.width,
          height: canvas.height,
          originalSize,
          compressedSize,
          compressionRatio: originalSize > 0 ? compressedSize / originalSize : 1
        });
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = base64Data;
  });
}

/**
 * Enhance image contrast for better OCR accuracy
 */
function enhanceContrast(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  factor: number = 1.2
): void {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const intercept = 128 * (1 - factor);

  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, Math.max(0, data[i] * factor + intercept));     // R
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] * factor + intercept)); // G
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] * factor + intercept)); // B
    // Alpha channel (data[i + 3]) remains unchanged
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Auto-detect and crop to card boundaries (simple edge detection)
 */
export async function detectCardBoundaries(base64Data: string): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
} | null> {
  return new Promise((resolve) => {
    const img = new Image();
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Simple edge detection - find content boundaries
      let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
      const threshold = 240; // Near-white threshold

      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;
          const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
          
          if (brightness < threshold) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      }

      // Add padding
      const padding = 20;
      minX = Math.max(0, minX - padding);
      minY = Math.max(0, minY - padding);
      maxX = Math.min(canvas.width, maxX + padding);
      maxY = Math.min(canvas.height, maxY + padding);

      // Only return if we found reasonable boundaries
      const detectedWidth = maxX - minX;
      const detectedHeight = maxY - minY;
      
      if (detectedWidth > 100 && detectedHeight > 50) {
        resolve({ x: minX, y: minY, width: detectedWidth, height: detectedHeight });
      } else {
        resolve(null);
      }
    };

    img.onerror = () => resolve(null);
    img.src = base64Data;
  });
}

/**
 * Crop image to specified boundaries
 */
export async function cropImage(
  base64Data: string,
  bounds: { x: number; y: number; width: number; height: number }
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = bounds.width;
      canvas.height = bounds.height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.drawImage(
        img,
        bounds.x, bounds.y, bounds.width, bounds.height,
        0, 0, bounds.width, bounds.height
      );

      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = base64Data;
  });
}

/**
 * Generate SHA-256 hash of image data for caching
 */
export async function hashImage(base64Data: string): Promise<string> {
  const cleanBase64 = base64Data.split(',')[1] || base64Data;
  const encoder = new TextEncoder();
  const data = encoder.encode(cleanBase64);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Check if file is a PDF
 */
export function isPDF(mimeType: string): boolean {
  return mimeType.includes('pdf');
}

/**
 * Get file size from base64 string (approximate bytes)
 */
export function getBase64Size(base64: string): number {
  const cleanBase64 = base64.split(',')[1] || base64;
  return Math.round((cleanBase64.length * 3) / 4);
}
