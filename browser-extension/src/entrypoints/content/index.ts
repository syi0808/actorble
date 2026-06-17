export default defineContentScript({
  matches: ['http://localhost/*', 'http://127.0.0.1/*'],
  allFrames: true,
  runAt: 'document_idle',
  main() {
    // Runtime host wiring will be added when scenario execution is implemented.
  },
})

