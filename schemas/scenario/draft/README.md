# Actorble Scenario Draft

이 draft는 Actorble의 첫 portable scenario document 형태를 정의합니다.
browser runtime과 browser extension이 첫 구체 authoring target이므로 browser-led
draft로 시작합니다.

## Design Direction

- scenario document JSON을 source of truth로 둡니다.
- 생성된 TypeScript 또는 platform code는 export target입니다.
- code-to-JSON 변환은 portable spec 범위 밖입니다.
- spec은 intent를 기록하며 platform execution internal을 기록하지 않습니다.
- platform GUI app은 validation wiring, migration, compilation, storage, execution
  request를 소유합니다.
- platform runtime은 target resolution, geometry, interactability, input dispatch,
  settlement, cancellation, trace 같은 action lifecycle semantic을 소유합니다.

## Schema Files

- `scenario.schema.json`: scenario document용 draft JSON Schema
- `examples/`: authoring shape를 설명하는 읽기용 예제
- `fixtures/valid/`: GUI compiler 테스트용 valid conformance fixture
- `fixtures/invalid/`: validator가 거부해야 하는 invalid fixture

## Versioning

Draft document는 다음 값을 사용합니다.

```json
{
  "schemaVersion": "actorble.scenario.draft"
}
```

최소 하나의 non-browser platform 구현이 같은 document model을 검증하기 전까지 이
draft를 `actorble.scenario.v1`로 승격하지 않습니다.

## Common Contract Candidates

공통으로 유지될 가능성이 높은 영역:

- document envelope: `schemaVersion`, `id`, `name`, `description`, `steps`,
  `metadata`
- action intent: `click`, `moveTo`, `doubleClick`, `focus`, `type`, `typeInto`,
  `fill`, `press`, `scrollTo`, `drag`, `waitFor`, `delay`
- execution control: `timeout`, explicit `delay`, run-level `pacing`
- `platform`을 통한 platform namespacing

capability summary는 draft document에 저장하지 않습니다. 필요한 action/locator
capability는 platform GUI compiler가 `steps`에서 계산합니다.

## Browser-Led Areas

macOS, Windows, Linux runtime이 구체화되면서 바뀔 가능성이 큰 영역:

- locator strategy
- coordinate space
- surface, window, tab, application context
- pointer와 keyboard fidelity option
- recorder output quality
- target inspector metadata

compiler는 지원하지 않는 locator, option, platform extension을 silent no-op으로
처리하지 말고 capability error로 다루어야 합니다.
