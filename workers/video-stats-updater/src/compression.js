/**
 * Compress data using gzip
 * @param {string} data - Data to compress
 * @returns {Promise<Uint8Array>} Compressed data
 */
export async function compressData(data) {
  // Convert string to Uint8Array
  const encoder = new TextEncoder();
  const input = encoder.encode(data);
  
  // Create a CompressionStream with gzip
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  const reader = cs.readable.getReader();
  
  // Write data to compression stream
  writer.write(input);
  writer.close();
  
  // Read compressed data
  const chunks = [];
  let totalLength = 0;
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLength += value.length;
  }
  
  // Combine chunks into single Uint8Array
  const compressed = new Uint8Array(totalLength);
  let offset = 0;
  
  for (const chunk of chunks) {
    compressed.set(chunk, offset);
    offset += chunk.length;
  }
  
  return compressed;
}

/**
 * Decompress gzipped data
 * @param {Uint8Array} compressed - Compressed data
 * @returns {Promise<any>} Decompressed and parsed JSON data
 */
export async function decompressData(compressed) {
  // Create a DecompressionStream with gzip
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();
  
  // Write compressed data to decompression stream
  writer.write(compressed);
  writer.close();
  
  // Read decompressed data
  const chunks = [];
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  
  // Convert to string and parse JSON
  const decoder = new TextDecoder();
  const text = chunks.map(chunk => decoder.decode(chunk)).join('');
  
  return JSON.parse(text);
}