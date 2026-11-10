/**
 * 快速制卡图片素材压缩工具 (Mobile Spec v1 深化)
 * 限制图片素材大小在指定字节以内（默认 ≤500KB），防止超大原始照片拖垮思源闪卡文档性能。
 */

export function estimateDataUrlBytes(dataUrl: string): number {
    const base64Part = dataUrl.split(",")[1] ?? "";
    return Math.round((base64Part.length * 3) / 4);
}

function readFileAsDataUrl(file: File | Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
    });
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(e);
        img.src = src;
    });
}

export async function compressImageFile(file: File | Blob, maxBytes = 500 * 1024): Promise<string> {
    // 1. 若原始图片已小于等于阈值且为轻量格式，直接返回 data URL
    if (file.size <= maxBytes && (file.type === "image/png" || file.type === "image/jpeg" || file.type === "image/webp")) {
        return readFileAsDataUrl(file);
    }

    // 2. 环境防御（非浏览器环境回退源数据）
    if (typeof document === "undefined" || typeof window === "undefined") {
        return readFileAsDataUrl(file);
    }

    try {
        const dataUrl = await readFileAsDataUrl(file);
        const img = await loadImage(dataUrl);

        let width = img.naturalWidth || img.width || 1000;
        let height = img.naturalHeight || img.height || 1000;
        const maxDimension = 1440; // 限制最大边长（防 4K 原图爆炸）

        if (width > maxDimension || height > maxDimension) {
            if (width > height) {
                height = Math.round((height * maxDimension) / width);
                width = maxDimension;
            } else {
                width = Math.round((width * maxDimension) / height);
                height = maxDimension;
            }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return dataUrl;

        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.88;
        let compressed = canvas.toDataURL("image/jpeg", quality);

        // 步进压缩质量直到满足 ≤ maxBytes 预算
        while (estimateDataUrlBytes(compressed) > maxBytes && quality > 0.3) {
            quality -= 0.15;
            compressed = canvas.toDataURL("image/jpeg", quality);
        }

        return compressed;
    } catch {
        // 异常降级直接转 dataUrl
        return readFileAsDataUrl(file);
    }
}
