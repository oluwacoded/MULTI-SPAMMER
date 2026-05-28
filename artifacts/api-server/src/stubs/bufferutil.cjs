// Stub for bufferutil optional native module
module.exports = { mask: function(source, mask, output, offset, length) {
  for (let i = 0; i < length; i++) output[offset + i] = source[i] ^ mask[i & 3];
}, unmask: function(buffer, mask) {
  for (let i = 0; i < buffer.length; i++) buffer[i] ^= mask[i & 3];
}};
