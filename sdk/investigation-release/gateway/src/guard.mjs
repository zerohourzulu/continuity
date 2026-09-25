import {Transform} from 'node:stream';
import {parseStrictJson} from './strict-json.mjs';
export function guardedInput(source) {
  let pending = Buffer.alloc(0),
    timer,
    messages = 0;
  const input = new Transform({
    transform(chunk, _encoding, callback) {
      try {
        pending = Buffer.concat([pending, chunk]);
        if (pending.length > 65536) throw Error("INPUT_LIMIT");
        let end;
        while ((end = pending.indexOf(10)) !== -1) {
          const frame = pending.subarray(0, end);
          pending = pending.subarray(end + 1);
          if (++messages > 1024) throw Error("MESSAGE_LIMIT");
          parseStrictJson(frame, {
            maxBytes: 16384,
            maxDepth: 12,
            maxNodes: 2048,
          });
          this.push(Buffer.concat([frame, Buffer.from("\n")]));
        }
        if (pending.length > 16384) throw Error("FRAME_LIMIT");
        clearTimeout(timer);
        if (pending.length)
          timer = setTimeout(() => {
            process.stderr.write("FRAME_TIMEOUT\n");
            process.exit(2);
          }, 5000);
        callback();
      } catch {
        callback(Error("INVALID_FRAME"));
      }
    },
    flush(callback) {
      clearTimeout(timer);
      callback(pending.length ? Error("INCOMPLETE_FRAME") : undefined);
    },
  });
  input.on("error", () => {
    process.stderr.write("INPUT_REFUSED\n");
    process.exit(2);
  });
  source.pipe(input);
  return input;
}
