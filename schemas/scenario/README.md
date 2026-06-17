# Actorble Scenario Spec

이 디렉토리는 Actorble의 portable scenario document 명세를 소유합니다.
의도적으로 runtime package가 아니라 specification 영역으로 둡니다.

## Ownership

`schemas/scenario`가 소유하는 것:

- JSON Schema 파일
- version과 profile naming 규칙
- JSON Schema만으로 표현하기 어려운 semantic note
- valid/invalid 예제
- platform GUI compiler 테스트에서 사용할 conformance fixture

`schemas/scenario`가 소유하지 않는 것:

- browser, macOS, Windows, Linux runtime 실행
- scenario compiler
- recorder 구현
- GUI storage, import/export, builder 동작
- code generation

각 platform GUI는 자기 application directory 아래에 scenario compiler를 둡니다.
예를 들어 browser extension은 scenario document를 `@actorble/browser` runtime
scenario object로 compile하고, 향후 macOS app은 같은 document를 macOS runtime
command model로 compile할 수 있습니다.

## Current Status

현재 spec은 browser-led draft입니다. 두 번째 platform 구현이 실제로 공통화 가능한
부분과 platform profile로 분리해야 하는 부분을 드러내기 전까지 draft로 유지합니다.

```txt
schemas/scenario/
  README.md
  draft/
    README.md
    scenario.schema.json
    examples/
    fixtures/
      valid/
      invalid/
```

## Compatibility Model

Actorble scenario document는 직접 실행되는 runtime API object가 아니라 portable
artifact입니다. 기대 흐름은 다음과 같습니다.

```txt
Scenario document JSON
-> schema validation
-> migration if needed
-> platform GUI 내부 compiler
-> platform runtime 실행
```

schema는 user intent와 안정적인 interchange data를 표현합니다. platform capability
check, locator fidelity, permission constraint, 정확한 runtime action lifecycle은
platform GUI compiler와 platform runtime의 책임입니다.
