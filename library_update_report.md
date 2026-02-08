# Library Update Report

## Execution
- Timestamp (UTC): 2026-02-08T23:34:26Z
- Project root: /Users/guilhermevarela/Documents/Projetos/PokerMarketing-Agency
- Package manager: bun
- Lockfile: bun.lock or bun.lockb
- Git repo detected: true
- Git tree before: clean
- Git tree after: dirty
- Dry run: false

## Analysis
- Dependencies before update: 92
- Dependencies after update: 92
- Outdated status: completed
- Outdated count: 0
- Outdated log: /Users/guilhermevarela/Documents/Projetos/PokerMarketing-Agency/library_update_report.outdated.log

## Divergences
- Validation command failed: bun run test

## Update
- Commands executed:
  - bun update --latest (fallback: bun update)
- Update status: updated
- Update log: /Users/guilhermevarela/Documents/Projetos/PokerMarketing-Agency/library_update_report.update.log

### Update Log Tail
    ^ @ai-sdk/react 3.0.39 -> 3.0.79
    ^ @clerk/backend 2.29.0 -> 2.30.1
    ^ @clerk/clerk-react 5.59.2 -> 5.60.0
    ^ @clerk/express 1.7.60 -> 1.7.69
    ^ @fal-ai/client 1.8.1 -> 1.9.0
    ^ @google/genai 1.34.0 -> 1.40.0
    ^ @lobehub/ui 4.21.2 -> 4.35.0
    ^ @openrouter/ai-sdk-provider 1.5.4 -> 2.1.1
    ^ @openrouter/sdk 0.3.10 -> 0.8.0
    ^ @upstash/qstash 2.8.4 -> 2.9.0
    ^ @upstash/ratelimit 2.0.7 -> 2.0.8
    ^ @upstash/redis 1.36.0 -> 1.36.2
    ^ @vercel/blob 2.0.0 -> 2.2.0
    ^ ai 6.0.39 -> 6.0.77
    ^ antd 6.2.0 -> 6.2.3
    ^ bullmq 5.66.4 -> 5.67.3
    ^ cloudinary 2.8.0 -> 2.9.0
    ^ cors 2.8.5 -> 2.8.6
    ^ dotenv 17.2.3 -> 17.2.4
    ^ framer-motion 12.29.0 -> 12.33.0
    ^ ioredis 5.8.2 -> 5.9.2
    ^ lucide-react 0.562.0 -> 0.563.0
    ^ motion 12.29.0 -> 12.33.0
    ^ pg 8.17.0 -> 8.18.0
    ^ pino 9.14.0 -> 10.3.0
    ^ pino-pretty 12.1.0 -> 13.1.3
    ^ react 19.2.3 -> 19.2.4
    ^ react-dom 19.2.3 -> 19.2.4
    ^ react-dropzone 14.3.8 -> 14.4.0
    ^ react-router-dom 7.11.0 -> 7.13.0
    ^ recharts 3.6.0 -> 3.7.0
    ^ shiki 3.21.0 -> 3.22.0
    ^ streamdown 2.0.1 -> 2.1.0
    ^ swr 2.3.8 -> 2.4.0
    ^ zod 4.3.5 -> 4.3.6
    ^ zustand 5.0.10 -> 5.0.11
    
    253 packages installed [11.19s]
    
    Blocked 3 postinstalls. Run `bun pm untrusted` for details.


## Tests
- Planned commands:
  - bun run test
  - bun run typecheck
  - bun run build
- Executed commands:
  - bun run test
- Test status: failed
- Test exit code: 1
- Failed command: bun run test
- Test log: /Users/guilhermevarela/Documents/Projetos/PokerMarketing-Agency/library_update_report.tests.log

### Test Log Tail
           |                        ^
         43|       body: await response.json(),
         44|     };
     ❯ test/integration/upload-security.test.mjs:213:22
    
    ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[17/19]⎯
    
     FAIL  test/integration/upload-security.test.mjs > /api/upload security > edge cases > should reject content type with parameters
    TypeError: Cannot read properties of undefined (reading 'status')
     ❯ uploadFile test/integration/upload-security.test.mjs:42:24
         40| 
         41|     return {
         42|       status: response.status,
           |                        ^
         43|       body: await response.json(),
         44|     };
     ❯ test/integration/upload-security.test.mjs:221:22
    
    ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[18/19]⎯
    
     FAIL  test/integration/upload-security.test.mjs > /api/upload security > error message quality > should provide helpful error with list of allowed types
    TypeError: Cannot read properties of undefined (reading 'status')
     ❯ uploadFile test/integration/upload-security.test.mjs:42:24
         40| 
         41|     return {
         42|       status: response.status,
           |                        ^
         43|       body: await response.json(),
         44|     };
     ❯ test/integration/upload-security.test.mjs:231:22
    
    ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[19/19]⎯
    
    
     Test Files  1 failed | 13 passed (14)
          Tests  19 failed | 88 passed (107)
       Start at  20:34:40
       Duration  2.37s (transform 667ms, setup 3.59s, import 639ms, tests 360ms, environment 11.41s)
    
    error: script "test" exited with code 1


## Changed Files
- Changed files count: 1
- package.json

