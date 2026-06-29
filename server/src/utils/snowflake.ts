// Twitter-style snowflake ID generator. 64-bit-ish IDs returned as decimal strings.
// Layout: 42 bits ms-since-epoch | 10 bits machine/sequence-mix | 12 bits sequence.
const EPOCH = 1704067200000; // 2024-01-01T00:00:00Z

let lastTimestamp = -1;
let sequence = 0;
const machineId = Math.floor(Math.random() * 1024); // single-process deployment

export function snowflake(): string {
  let now = Date.now();
  if (now === lastTimestamp) {
    sequence = (sequence + 1) & 0xfff;
    if (sequence === 0) {
      // sequence overflow within the same ms — spin until the next ms
      while (now <= lastTimestamp) now = Date.now();
    }
  } else {
    sequence = 0;
  }
  lastTimestamp = now;

  const timestampBits = BigInt(now - EPOCH) << 22n;
  const machineBits = BigInt(machineId) << 12n;
  const seqBits = BigInt(sequence);
  return (timestampBits | machineBits | seqBits).toString();
}
