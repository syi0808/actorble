import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const scaffoldFiles = [
  'package.json',
  'tsconfig.json',
  'wxt.config.ts',
  'vitest.config.ts',
  'src/entrypoints/popup/index.html',
  'src/entrypoints/popup/main.tsx',
  'src/entrypoints/sidepanel/index.html',
  'src/entrypoints/sidepanel/main.tsx',
  'src/entrypoints/background/index.ts',
  'src/entrypoints/content/index.ts',
  'src/shared/result.ts',
  'src/scenario/types.ts',
  'src/scenario/validate.ts',
  'src/scenario/migrate.ts',
  'src/scenario/compile-to-browser-runtime.ts',
  'src/scenario/export-code.ts',
  'src/recorder/event-capture.ts',
  'src/recorder/event-to-step.ts',
  'src/recorder/locator-synthesis.ts',
  'src/inspector/target-picker.ts',
  'src/inspector/locator-preview.ts',
  'src/storage/index.ts',
  'src/storage/README.md',
  'src/messaging/index.ts',
  'src/messaging/README.md',
  'src/trace/index.ts',
  'src/trace/README.md',
];

describe('browser extension scaffold', () => {
  it('tracks WXT entrypoints and Actorble extension boundaries', async () => {
    await Promise.all(
      scaffoldFiles.map(async (file) => {
        await access(join(file));
      }),
    );
  });

  it('delegates source manifest generation to WXT config', async () => {
    await expect(access('manifest.json')).rejects.toHaveProperty('code', 'ENOENT');

    const config = await readFile('wxt.config.ts', 'utf8');

    expect(config).toContain("srcDir: 'src'");
    expect(config).toContain('manifestVersion: 3');
    expect(config).toContain("modules: ['@wxt-dev/module-react']");
    expect(config).toContain("permissions: ['storage']");
    expect(config).toContain("host_permissions: ['http://*/*', 'https://*/*']");
  });

  it('mounts React apps from popup and sidepanel entrypoint shells', async () => {
    const popupHtml = await readFile('src/entrypoints/popup/index.html', 'utf8');
    const sidepanelHtml = await readFile('src/entrypoints/sidepanel/index.html', 'utf8');

    expect(popupHtml).toContain('<div id="root"></div>');
    expect(popupHtml).toContain('<script type="module" src="./main.tsx"></script>');
    expect(sidepanelHtml).toContain('<div id="root"></div>');
    expect(sidepanelHtml).toContain('<script type="module" src="./main.tsx"></script>');
  });

  it('injects the content script into all supported websites', async () => {
    const contentScript = await readFile('src/entrypoints/content/index.ts', 'utf8');

    expect(contentScript).toContain("matches: ['http://*/*', 'https://*/*']");
  });

  it('uses one sidepanel scenario lifecycle shell', async () => {
    const sidepanelMain = await readFile('src/entrypoints/sidepanel/main.tsx', 'utf8');
    const scenarioShell = sectionMarkup(sidepanelMain, 'scenario-shell');

    expect(topLevelSectionIds(sidepanelMain)).toEqual([
      'scenario-shell',
      'builder-workbench',
      'debug-drawer',
    ]);
    expect(sidepanelMain).toContain('id="scenario-shell-title"');
    expect(scenarioShell).toContain('RecordedDraftReview');
    expect(scenarioShell).toContain('Check scenario');
    expect(scenarioShell).toContain('onRun');
    expect(scenarioShell).toContain('label="Scenario"');
    expectNoLegacyPeerSurfaceIds(sidepanelMain);
  });

  it('uses one sidepanel builder workbench for inline workflow step editing', async () => {
    const sidepanelMain = await readFile('src/entrypoints/sidepanel/main.tsx', 'utf8');
    const workbench = sectionMarkup(sidepanelMain, 'builder-workbench');

    expect(sidepanelMain).toContain('id="builder-workbench-title"');
    expect(workbench).toContain('SortableWorkflowStepCard');
    expect(workbench).toContain('PendingWorkflowStepCard');
    expect(workbench).toContain('StepInspector');
    expect(workbench).toContain('ActionFamilySelect');
    expect(workbench).toContain('Test step');
    expect(workbench).not.toContain('builder-workbench-layout');
    expect(workbench).not.toContain('workbench-subheading');
    expectNoLegacyPeerSurfaceIds(sidepanelMain);
  });

  it('inlines target assignment in the selected-step workbench', async () => {
    const sidepanelMain = await readFile('src/entrypoints/sidepanel/main.tsx', 'utf8');
    const scenarioShell = sectionMarkup(sidepanelMain, 'scenario-shell');
    const workbench = sectionMarkup(sidepanelMain, 'builder-workbench');
    const debugDrawer = sectionMarkup(sidepanelMain, 'debug-drawer');

    expect(workbench).toContain('id="target-assignment-title"');
    expect(workbench).toContain('TargetAssignment');
    expect(workbench).toContain('LocatorPreviewCandidates');
    expect(workbench).toContain('onStart(row.id)');
    expect(workbench).not.toContain('onStopTargetAssignment');
    expect(workbench).not.toContain('view.buttons.stop');
    expect(workbench).not.toContain('target-slot-command');
    expect(scenarioShell).not.toContain('id="target-assignment-title"');
    expect(debugDrawer).not.toContain('id="target-assignment-title"');
    expectNoLegacyPeerSurfaceIds(sidepanelMain);
  });

  it('keeps validation, locator diagnostics, run trace, and failures in a collapsed debug drawer', async () => {
    const sidepanelMain = await readFile('src/entrypoints/sidepanel/main.tsx', 'utf8');
    const scenarioShell = sectionMarkup(sidepanelMain, 'scenario-shell');
    const workbench = sectionMarkup(sidepanelMain, 'builder-workbench');
    const debugDrawer = sectionMarkup(sidepanelMain, 'debug-drawer');

    expect(debugDrawer).toContain('id="debug-drawer-title"');
    expect(debugDrawer).toContain('id="debug-drawer-panel"');
    expect(debugDrawer).toContain('Issues');
    expect(debugDrawer).toContain('Locator candidates');
    expect(debugDrawer).toContain('Run trace');
    expect(debugDrawer).toContain('Failure');
    expect(debugDrawer).toContain('Collapsible.Content');
    expect(scenarioShell).not.toContain('IssuesList');
    expect(workbench).not.toContain('Run trace');
    expectNoLegacyPeerSurfaceIds(sidepanelMain);
  });
});

function topLevelSectionIds(markup: string): string[] {
  return [...markup.matchAll(/<section\b(?:(?!<section\b)[\s\S])*?id="([^"]+)"/g)].map(
    (match) => match[1],
  );
}

function sectionMarkup(markup: string, id: string): string {
  const startMatch = new RegExp(`<section\\b(?:(?!<section\\b)[\\s\\S])*?id="${id}"`).exec(markup);
  if (startMatch === null) {
    throw new Error(`Missing section ${id}.`);
  }

  const start = startMatch.index;
  const nextMatch = /<section\b/.exec(markup.slice(start + 1));
  const next = nextMatch === null ? -1 : start + 1 + nextMatch.index;
  return next < 0 ? markup.slice(start) : markup.slice(start, next);
}

function expectNoLegacyPeerSurfaceIds(html: string): void {
  expect(html).not.toContain('id="document-title"');
  expect(html).not.toContain('id="recording-title"');
  expect(html).not.toContain('id="steps-title"');
  expect(html).not.toContain('id="step-editor-title"');
  expect(html).not.toContain('id="target-picker-title"');
  expect(html).not.toContain('id="locator-preview-title"');
  expect(html).not.toContain('id="validation-title"');
  expect(html).not.toContain('id="run-title"');
}
