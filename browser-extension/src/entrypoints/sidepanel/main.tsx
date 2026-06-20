import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type RefObject,
  type TextareaHTMLAttributes,
} from 'react'
import { createRoot } from 'react-dom/client'
import { Collapsible, Tabs } from 'radix-ui'
import { browser } from 'wxt/browser'
import {
  autoApplyTargetFromPreview,
  createLocatorPreviewer,
  type LocatorPreviewCandidateView,
} from '../../inspector/locator-preview.js'
import {
  createTargetPicker,
} from '../../inspector/target-picker.js'
import { createWxtScenarioStorageRepository } from '../../storage/index.js'
import {
  Button,
  BrandMark,
  Field,
  Select,
  StatusPill,
  TextInput,
  Textarea,
  UiProvider,
  type ButtonVariant,
} from '../../ui/components.js'
import { CommandIcon, type CommandIconName } from '../../ui/icons.js'
import {
  actionHint,
  actionIcon,
  capitalize,
  downloadFile,
  formatActionLabel,
} from '../../ui/product-format.js'
import type { BuilderStepActionFamily } from '../../builder/index.js'
import type { ScenarioCoordinateSpace } from '../../scenario/types.js'
import { sidepanelLaunchParamsFromUrl } from './launch-params.js'
import {
  createSidepanelScenarioEditor,
  createSidepanelScenarioEditorView,
  type SidepanelActionFamilyOptionView,
  type SidepanelButtonView,
  type SidepanelIssueView,
  type SidepanelRecordedDraftReviewView,
  type SidepanelScenarioEditorSnapshot,
  type SidepanelScenarioEditorView,
  type SidepanelStepRowView,
  type SidepanelTargetSlotRowView,
} from './scenario-editor.js'
import {
  createSidepanelRecompositionViewModel,
  type SidepanelBuilderWorkbenchView,
  type SidepanelDebugDrawerState,
  type SidepanelDebugDrawerView,
  type SidepanelDebugDrawerViewModel,
  type SidepanelScenarioShellView,
  type SidepanelTargetAssignmentView,
} from './recomposition-view-model.js'

const scenarioRepository = createWxtScenarioStorageRepository()
const launchParams = sidepanelLaunchParamsFromUrl(window.location.href)
const targetTabId = launchParams.targetTabId
const editor = createSidepanelScenarioEditor({
  listScenarios() {
    return scenarioRepository.list()
  },
  saveScenario(input) {
    return scenarioRepository.save(input)
  },
  updateScenario(id, update) {
    return scenarioRepository.update(id, update)
  },
  importScenarioJson(jsonText) {
    return scenarioRepository.importJson(jsonText)
  },
  exportScenarioJson(id) {
    return scenarioRepository.exportJson(id)
  },
  async getActiveTab() {
    const [activeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    })
    return activeTab ?? null
  },
  async getTab(tabId) {
    return await browser.tabs.get(tabId)
  },
  sendMessage(message) {
    return browser.runtime.sendMessage(message)
  },
}, {
  targetTabId,
})
const targetPicker = createTargetPicker({
  async getActiveTab() {
    const [activeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    })
    return activeTab ?? null
  },
  async getTab(tabId) {
    return await browser.tabs.get(tabId)
  },
  sendMessage(message) {
    return browser.runtime.sendMessage(message)
  },
}, {
  targetTabId,
})
const locatorPreviewer = createLocatorPreviewer({
  async getActiveTab() {
    const [activeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    })
    return activeTab ?? null
  },
  async getTab(tabId) {
    return await browser.tabs.get(tabId)
  },
  sendMessage(message) {
    return browser.runtime.sendMessage(message)
  },
}, {
  targetTabId,
})

type ExportFormat = 'json' | 'typescript'

function SidepanelApp(): ReactElement {
  const [, forceRender] = useState(0)
  const [debugDrawerState, setDebugDrawerState] = useState<SidepanelDebugDrawerState>({})
  const [selectedActionFamily, setSelectedActionFamily] = useState<BuilderStepActionFamily>('click')
  const [exportFormat, setExportFormat] = useState<ExportFormat>('json')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const snapshot = editor.getSnapshot()
  const editorView = createSidepanelScenarioEditorView(snapshot)
  const recomposedView = createSidepanelRecompositionViewModel({
    editor: snapshot,
    targetPicker: targetPicker.getSnapshot(),
    locatorPreview: locatorPreviewer.getSnapshot(),
    debugDrawer: debugDrawerState,
  })
  const paletteFamily = useMemo(
    () => selectedPaletteFamily(
      selectedActionFamily,
      editorView.actionFamilyOptions,
      editorView.selectedStepFields.actionFamily,
    ),
    [editorView.actionFamilyOptions, editorView.selectedStepFields.actionFamily, selectedActionFamily],
  )
  const refreshView = useCallback(() => {
    forceRender((version) => version + 1)
  }, [])
  const runAction = useCallback(async <TResult,>(
    action: () => Promise<TResult>,
  ): Promise<TResult> => {
    const operation = action()
    refreshView()
    try {
      return await operation
    } finally {
      refreshView()
    }
  }, [refreshView])
  const runTargetPickerAction = useCallback(async (
    action: () => Promise<unknown>,
  ): Promise<void> => {
    const operation = action()
    refreshView()
    await operation
    refreshView()
  }, [refreshView])
  const runLocatorPreviewAction = useCallback(async (
    action: () => Promise<unknown>,
  ): Promise<void> => {
    const operation = action()
    refreshView()
    await operation
    const preview = locatorPreviewer.getSnapshot()
    if (preview.status === 'failed' || preview.issues.length > 0) {
      setDebugDrawerState((current) => ({
        ...current,
        activeView: 'locator',
      }))
    }
    refreshView()
  }, [refreshView])
  const startTargetAssignment = useCallback(async (slotId?: string): Promise<void> => {
    if (slotId !== undefined) {
      const selected = editor.selectTargetSlot(slotId)
      if (!selected.ok) {
        refreshView()
        return
      }
    }

    const currentSnapshot = editor.getSnapshot()
    const targetSlot = currentSnapshot.selectedTargetSlot
    if (targetSlot === undefined) {
      refreshView()
      return
    }

    locatorPreviewer.clear()
    await runTargetPickerAction(() => targetPicker.start({
      scenarioId: currentSnapshot.selectedScenarioId,
      targetSlot,
    }))
  }, [refreshView, runTargetPickerAction])
  const importSelectedFile = useCallback(async (file: File | undefined): Promise<void> => {
    if (file === undefined) {
      return
    }

    try {
      await runAction(async () => {
        await editor.importJson(await file.text())
      })
    } finally {
      if (fileInputRef.current !== null) {
        fileInputRef.current.value = ''
      }
    }
  }, [runAction])
  const exportSelectedScenario = useCallback(async (): Promise<void> => {
    if (exportFormat === 'typescript') {
      const exported = editor.exportSelectedCode()
      if (exported.ok) {
        downloadFile(exported.value.filename, exported.value.source, 'text/typescript')
      }
      refreshView()
      return
    }

    const operation = editor.exportSelected()
    refreshView()
    const exported = await operation
    if (exported.ok) {
      downloadFile(exported.value.filename, exported.value.jsonText, 'application/json')
    }
    refreshView()
  }, [exportFormat, refreshView])

  useEffect(() => {
    const listener = (message: unknown): void => {
      const editorHandled = editor.ingestMessage(message)
      const pickerHandled = targetPicker.ingestMessage(message)

      if (editorHandled && isFailedRuntimeStatusMessage(message)) {
        setDebugDrawerState((current) => ({
          ...current,
          activeView: 'failure',
        }))
      }

      if (editorHandled || pickerHandled) {
        refreshView()
      }

      if (!pickerHandled) {
        return
      }

      const selected = targetPicker.getSnapshot().selected
      if (selected?.targetSlot === undefined) {
        return
      }

      void runLocatorPreviewAction(async () => {
        const preview = await locatorPreviewer.previewTarget(selected.target, {
          scenarioId: selected.scenarioId ?? editor.getSnapshot().selectedScenarioId,
          targetSlot: selected.targetSlot,
        })
        if (!preview.ok) {
          return
        }

        const autoApplied = autoApplyTargetFromPreview(locatorPreviewer.getSnapshot())
        if (!autoApplied.ok) {
          locatorPreviewer.reportIssue(autoApplied.issues[0] ?? {
            code: 'inspector_error',
            message: 'Selected element could not be applied to the target slot.',
          })
          return
        }

        const applied = editor.applyTargetToTargetSlot(
          autoApplied.value.targetSlot,
          autoApplied.value.target,
        )
        if (!applied.ok) {
          locatorPreviewer.reportIssue(applied.issues[0] ?? {
            code: 'invalid_document',
            message: 'Selected element could not be applied to the target slot.',
          })
        }
      })
    }

    browser.runtime.onMessage.addListener(listener)
    void runAction(async () => {
      await editor.refresh()
      await editor.refreshTargetTabState()
      await editor.loadRecordedDraft(launchParams.recordedDraftId)
    })

    return () => {
      browser.runtime.onMessage.removeListener(listener)
    }
  }, [refreshView, runAction, runLocatorPreviewAction])

  return (
    <UiProvider>
      <main>
        <AppHeader summary={recomposedView.scenarioShell.summary} />
        <ScenarioShell
          exportFormat={exportFormat}
          fileInputRef={fileInputRef}
          onCreate={() => {
            editor.createScenario({
              name: 'Untitled scenario',
              initialStepFamily: paletteFamily,
            })
            refreshView()
          }}
          onExport={() => void exportSelectedScenario()}
          onExportFormatChange={setExportFormat}
          onImport={(file) => void importSelectedFile(file)}
          onMetadataChange={(update) => {
            editor.updateDocumentFields(update)
            refreshView()
          }}
          onRecord={() => void runAction(() => (
            snapshot.currentRecord?.status === 'recording'
              ? editor.stopRecording()
              : editor.startRecording()
          ))}
          onRun={() => void runAction(() => editor.runSelectedScenario())}
          onSave={() => void runAction(() => editor.saveDraft())}
          onScenarioChange={(id) => {
            editor.selectScenario(id)
            refreshView()
          }}
          onValidate={() => {
            setDebugDrawerState((current) => ({
              ...current,
              activeView: 'validation',
            }))
            editor.validateDraft()
            refreshView()
          }}
          review={recomposedView.recordedDraftReview}
          shell={recomposedView.scenarioShell}
          snapshot={snapshot}
          onRecordedDraftAction={(action) => {
            switch (action) {
              case 'replace':
                editor.replaceWithRecordedDraft()
                refreshView()
                return
              case 'append':
                editor.appendRecordedDraftSteps()
                refreshView()
                return
              case 'discard':
                editor.discardRecordedDraft()
                refreshView()
                return
              case 'save-as-new':
                void runAction(() => editor.saveRecordedDraftAsNew())
                return
              case 'export': {
                const exported = editor.exportRecordedDraft()
                if (exported.ok) {
                  downloadFile(exported.value.filename, exported.value.jsonText, 'application/json')
                }
                refreshView()
                return
              }
            }
          }}
          onSensitiveConfirm={(confirmed) => {
            editor.confirmRecordedDraftSensitiveInputs(confirmed)
            refreshView()
          }}
        />
        <BuilderWorkbench
          actionFamily={paletteFamily}
          editorView={editorView}
          onActionFamilyChange={setSelectedActionFamily}
          onAddStep={(family = paletteFamily) => {
            editor.addStep(family)
            refreshView()
          }}
          onCandidateSelect={(candidate) => {
            const preview = locatorPreviewer.getSnapshot()
            const selectedCandidate = preview.candidates[candidate.index]
            if (selectedCandidate === undefined || selectedCandidate.status !== 'unique') {
              return
            }

            const targetSlot = preview.targetSlot
            if (targetSlot !== undefined) {
              editor.applyLocatorToTargetSlot(targetSlot, selectedCandidate.locator)
            }
            refreshView()
          }}
          onDeleteStep={() => {
            editor.deleteSelectedStep()
            refreshView()
          }}
          onDuplicateStep={() => {
            editor.duplicateSelectedStep()
            refreshView()
          }}
          onInsertStep={(family = paletteFamily) => {
            editor.insertStep(family)
            refreshView()
          }}
          onMoveStep={(delta) => {
            editor.moveSelectedStep(delta)
            refreshView()
          }}
          onSelectStep={(index) => {
            editor.selectStep(index)
            refreshView()
          }}
          onSelectTargetSlot={(slotId) => {
            editor.selectTargetSlot(slotId)
            refreshView()
          }}
          onStartTargetAssignment={(slotId) => void startTargetAssignment(slotId)}
          onStepActionChange={(family) => {
            editor.updateSelectedStepActionFamily(family)
            refreshView()
          }}
          onStepFieldChange={(update) => {
            editor.updateSelectedStepFields(update)
            refreshView()
          }}
          onStopTargetAssignment={() => void runTargetPickerAction(() => targetPicker.stop())}
          onTestStep={() => void runAction(() => editor.dryRunSelectedStep())}
          snapshot={snapshot}
          targetAssignment={recomposedView.targetAssignment}
          workbench={recomposedView.builderWorkbench}
        />
        <DebugDrawer
          onExpandedChange={(expanded) => {
            setDebugDrawerState((current) => ({
              ...current,
              expanded,
            }))
          }}
          onViewChange={(activeView) => {
            setDebugDrawerState({
              expanded: true,
              activeView,
            })
          }}
          view={recomposedView.debugDrawer}
        />
      </main>
    </UiProvider>
  )
}

function AppHeader({
  summary,
}: Readonly<{
  summary: string
}>): ReactElement {
  return (
    <header className="app-header">
      <div className="brand-lockup">
        <BrandMark />
        <div>
          <p className="eyebrow">Actorble</p>
          <h1>Scenario Builder</h1>
        </div>
      </div>
      <span className="summary">{summary}</span>
    </header>
  )
}

function ScenarioShell({
  exportFormat,
  fileInputRef,
  onCreate,
  onExport,
  onExportFormatChange,
  onImport,
  onMetadataChange,
  onRecord,
  onRecordedDraftAction,
  onRun,
  onSave,
  onScenarioChange,
  onSensitiveConfirm,
  onValidate,
  review,
  shell,
  snapshot,
}: Readonly<{
  exportFormat: ExportFormat
  fileInputRef: RefObject<HTMLInputElement | null>
  onCreate(): void
  onExport(): void
  onExportFormatChange(format: ExportFormat): void
  onImport(file: File | undefined): void
  onMetadataChange(update: Readonly<{ name?: string; description?: string }>): void
  onRecord(): void
  onRecordedDraftAction(action: 'replace' | 'append' | 'discard' | 'save-as-new' | 'export'): void
  onRun(): void
  onSave(): void
  onScenarioChange(id: string): void
  onSensitiveConfirm(confirmed: boolean): void
  onValidate(): void
  review: SidepanelRecordedDraftReviewView | undefined
  shell: SidepanelScenarioShellView
  snapshot: SidepanelScenarioEditorSnapshot
}>): ReactElement {
  return (
    <section id="scenario-shell" className="scenario-shell" aria-labelledby="scenario-shell-title">
      <div className="scenario-shell-top">
        <div className="section-heading">
          <h2 id="scenario-shell-title">Scenario</h2>
          <span className="summary">{shell.summary}</span>
        </div>
        <div className="scenario-shell-status">
          <StatusPill status={shell.targetTab.status}>{shell.targetTab.summary}</StatusPill>
          <StatusPill status={shell.recordStatus ?? 'idle'}>{recordSummary(snapshot)}</StatusPill>
          <StatusPill status={snapshot.currentRun?.status ?? 'idle'}>
            {capitalize(snapshot.currentRun?.status ?? 'idle')}
          </StatusPill>
        </div>
      </div>
      {shell.issueSummary === 'None' ? null : (
        <p className="shell-issue">{shell.issueSummary}</p>
      )}
      <div className="scenario-metadata-grid">
        <Field label="Scenario">
          <Select
            aria-label="Scenario"
            disabled={shell.pendingAction !== null || shell.scenarioOptions.length === 0}
            onChange={(event) => onScenarioChange(event.currentTarget.value)}
            value={shell.selectedScenarioId ?? ''}
          >
            {shell.scenarioOptions.length === 0
              ? <option value="">No saved scenarios</option>
              : shell.scenarioOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
          </Select>
        </Field>
        <Field label="Name">
          <TextInput
            autoComplete="off"
            onChange={(event) => onMetadataChange({ name: event.currentTarget.value })}
            type="text"
            value={shell.metadata.name}
          />
        </Field>
        <Field className="description-field" label="Description">
          <Textarea
            className="compact-textarea"
            onChange={(event) => onMetadataChange({ description: event.currentTarget.value })}
            value={shell.metadata.description}
          />
        </Field>
      </div>
      <div className="scenario-shell-toolbar">
        <ViewButton icon="plus" onClick={onCreate} variant="secondary" view={shell.buttons.create}>
          New
        </ViewButton>
        <label className="file-button">
          <input
            ref={fileInputRef}
            accept="application/json,.json"
            disabled={shell.buttons.import.disabled}
            onChange={(event) => onImport(event.currentTarget.files?.[0])}
            type="file"
          />
          <CommandIcon name="file-up" />
          <span className="button-label">Import</span>
        </label>
        <Select
          aria-label="Export format"
          className="compact-select"
          disabled={shell.buttons.export.disabled}
          onChange={(event) => onExportFormatChange(event.currentTarget.value as ExportFormat)}
          value={exportFormat}
        >
          <option value="json">JSON</option>
          <option value="typescript">TypeScript</option>
        </Select>
        <ViewButton icon="download" onClick={onExport} variant="secondary" view={shell.buttons.export}>
          Export
        </ViewButton>
        <ViewButton icon="check" onClick={onValidate} variant="secondary" view={shell.buttons.validate}>
          Check scenario
        </ViewButton>
        <ViewButton icon="save" onClick={onSave} variant="secondary" view={shell.buttons.save}>
          Save
        </ViewButton>
        <ViewButton
          icon={snapshot.currentRecord?.status === 'recording' ? 'square' : 'record'}
          onClick={onRecord}
          variant={snapshot.currentRecord?.status === 'recording' ? 'danger' : 'secondary'}
          view={shell.buttons.record}
        >
          {shell.buttons.record.label}
        </ViewButton>
        <ViewButton icon="play" onClick={onRun} variant="primary" view={shell.buttons.run}>
          {shell.buttons.run.label}
        </ViewButton>
      </div>
      <RecordedDraftReview
        onAction={onRecordedDraftAction}
        onSensitiveConfirm={onSensitiveConfirm}
        review={review}
      />
    </section>
  )
}

function RecordedDraftReview({
  onAction,
  onSensitiveConfirm,
  review,
}: Readonly<{
  onAction(action: 'replace' | 'append' | 'discard' | 'save-as-new' | 'export'): void
  onSensitiveConfirm(confirmed: boolean): void
  review: SidepanelRecordedDraftReviewView | undefined
}>): ReactElement | null {
  if (review === undefined) {
    return null
  }

  const hasSensitiveReviewItems = review.sensitiveSummary !== 'No sensitive inputs'

  return (
    <div className="recorded-draft-review">
      <dl className="recorded-draft-fields">
        <div>
          <dt>Draft</dt>
          <dd>{review.summary}</dd>
        </div>
        <div>
          <dt>Check</dt>
          <dd>{review.validationSummary}</dd>
        </div>
        <div>
          <dt>Sensitive</dt>
          <dd>{review.sensitiveSummary}</dd>
        </div>
      </dl>
      <label className="checkbox-field">
        <input
          checked={review.sensitiveInputsConfirmed}
          disabled={!hasSensitiveReviewItems}
          onChange={(event) => onSensitiveConfirm(event.currentTarget.checked)}
          type="checkbox"
        />
        <span>Confirm sensitive recorded inputs</span>
      </label>
      <div className="toolbar wrap-toolbar">
        <ViewButton icon="check" onClick={() => onAction('replace')} variant="primary" view={review.buttons.replace}>
          Replace
        </ViewButton>
        <ViewButton icon="plus" onClick={() => onAction('append')} variant="secondary" view={review.buttons.append}>
          Append
        </ViewButton>
        <ViewButton icon="trash" onClick={() => onAction('discard')} variant="danger" view={review.buttons.discard}>
          Discard
        </ViewButton>
        <ViewButton icon="save" onClick={() => onAction('save-as-new')} variant="secondary" view={review.buttons.saveAsNew}>
          Save as new
        </ViewButton>
        <ViewButton icon="download" onClick={() => onAction('export')} variant="secondary" view={review.buttons.export}>
          Export draft
        </ViewButton>
      </div>
    </div>
  )
}

function BuilderWorkbench({
  actionFamily,
  editorView,
  onActionFamilyChange,
  onAddStep,
  onCandidateSelect,
  onDeleteStep,
  onDuplicateStep,
  onInsertStep,
  onMoveStep,
  onSelectStep,
  onSelectTargetSlot,
  onStartTargetAssignment,
  onStepActionChange,
  onStepFieldChange,
  onStopTargetAssignment,
  onTestStep,
  snapshot,
  targetAssignment,
  workbench,
}: Readonly<{
  actionFamily: BuilderStepActionFamily
  editorView: SidepanelScenarioEditorView
  onActionFamilyChange(family: BuilderStepActionFamily): void
  onAddStep(family?: BuilderStepActionFamily): void
  onCandidateSelect(candidate: LocatorPreviewCandidateView): void
  onDeleteStep(): void
  onDuplicateStep(): void
  onInsertStep(family?: BuilderStepActionFamily): void
  onMoveStep(delta: -1 | 1): void
  onSelectStep(index: number): void
  onSelectTargetSlot(slotId: string): void
  onStartTargetAssignment(slotId?: string): void
  onStepActionChange(family: BuilderStepActionFamily): void
  onStepFieldChange(update: Parameters<typeof editor.updateSelectedStepFields>[0]): void
  onStopTargetAssignment(): void
  onTestStep(): void
  snapshot: SidepanelScenarioEditorSnapshot
  targetAssignment: SidepanelTargetAssignmentView
  workbench: SidepanelBuilderWorkbenchView
}>): ReactElement {
  const selected = workbench.selectedStep

  return (
    <section id="builder-workbench" aria-labelledby="builder-workbench-title">
      <div className="section-heading builder-heading">
        <h2 id="builder-workbench-title">Workflow</h2>
        <span className="summary">{selectedStepSummary(snapshot)}</span>
      </div>

      <div className="builder-workbench-layout">
        <div className="workbench-panel flow-panel">
          <div className="workbench-subheading">
            <div>
              <h3>Workflow</h3>
              <p className="panel-caption">Build the scenario in execution order.</p>
            </div>
          </div>
          <StepList onSelectStep={onSelectStep} rows={editorView.stepRows} />
          <ActionPalette
            actionFamily={actionFamily}
            addStepView={workbench.buttons.addStep}
            insertStepView={workbench.buttons.insertStep}
            onActionFamilyChange={onActionFamilyChange}
            onAddStep={onAddStep}
            onInsertStep={onInsertStep}
            options={workbench.actionFamilyOptions}
          />
        </div>

        <div className="workbench-panel properties-panel">
          <SelectedStepHero selected={selected} />
          <div className="selected-step-actions" aria-label="Selected step actions">
            <ViewButton icon="play" onClick={onTestStep} variant="secondary" view={workbench.buttons.dryRun}>
              Test step
            </ViewButton>
            <ViewButton icon="copy" onClick={onDuplicateStep} variant="secondary" view={workbench.buttons.duplicateStep}>
              Duplicate
            </ViewButton>
            <ViewButton
              icon="arrow-up"
              iconOnly
              onClick={() => onMoveStep(-1)}
              tooltip="Move step up"
              variant="subtle"
              view={workbench.buttons.moveStepUp}
            >
              Move step up
            </ViewButton>
            <ViewButton
              icon="arrow-down"
              iconOnly
              onClick={() => onMoveStep(1)}
              tooltip="Move step down"
              variant="subtle"
              view={workbench.buttons.moveStepDown}
            >
              Move step down
            </ViewButton>
            <ViewButton
              icon="trash"
              iconOnly
              onClick={onDeleteStep}
              tooltip="Delete step"
              variant="danger"
              view={workbench.buttons.deleteStep}
            >
              Delete step
            </ViewButton>
          </div>

          <StepInspector
            actionFamilyOptions={editorView.actionFamilyOptions}
            fields={editorView.selectedStepFields}
            onActionChange={onStepActionChange}
            onFieldChange={onStepFieldChange}
          />

          {editorView.selectedStepFields.controls.targetSlots ? (
            <TargetAssignment
              onCandidateSelect={onCandidateSelect}
              onSelectTargetSlot={onSelectTargetSlot}
              onStart={onStartTargetAssignment}
              onStop={onStopTargetAssignment}
              view={targetAssignment}
            />
          ) : null}

          <AdvancedJsonRepair
            fields={editorView.selectedStepFields}
            onFieldChange={onStepFieldChange}
          />
        </div>
      </div>
    </section>
  )
}

function StepList({
  onSelectStep,
  rows,
}: Readonly<{
  onSelectStep(index: number): void
  rows: readonly SidepanelStepRowView[]
}>): ReactElement {
  return (
    <ul className="step-list" aria-label="Scenario steps">
      {rows.map((row) => {
        const detailText = [row.targetSummary, row.inputSummary].filter(Boolean).join(' · ')

        return (
          <li key={row.id}>
            <button
              className="step-card"
              data-selected={row.selected ? 'true' : 'false'}
              data-validation={row.validationStatus}
              onClick={() => onSelectStep(row.index)}
              type="button"
            >
              <span className="step-index">{row.index + 1}</span>
              <span className="step-card-icon">
                <CommandIcon name={actionIcon(row.action)} />
              </span>
              <span className="step-card-main">
                <span className="step-title">{formatActionLabel(row.action)}</span>
                <span className="step-detail">
                  {detailText.length === 0 ? 'No target or input yet' : detailText}
                </span>
              </span>
              <span className="step-status">
                {row.validationStatus === 'valid' ? 'Ready' : 'Needs attention'}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function ActionPalette({
  actionFamily,
  addStepView,
  insertStepView,
  onActionFamilyChange,
  onAddStep,
  onInsertStep,
  options,
}: Readonly<{
  actionFamily: BuilderStepActionFamily
  addStepView: SidepanelButtonView
  insertStepView: SidepanelButtonView
  onActionFamilyChange(family: BuilderStepActionFamily): void
  onAddStep(family?: BuilderStepActionFamily): void
  onInsertStep(family?: BuilderStepActionFamily): void
  options: readonly SidepanelActionFamilyOptionView[]
}>): ReactElement {
  return (
    <div className="action-palette" aria-label="Action palette">
      <div className="action-palette-heading">
        <div>
          <h3>Add step</h3>
          <p className="panel-caption">Choose an action, then add it to the flow.</p>
        </div>
        <Select
          aria-label="Action family"
          className="compact-select"
          onChange={(event) => onActionFamilyChange(event.currentTarget.value as BuilderStepActionFamily)}
          value={actionFamily}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="action-palette-list">
        {options.map((option) => (
          <button
            key={option.value}
            className="action-palette-item"
            data-selected={option.value === actionFamily ? 'true' : 'false'}
            disabled={addStepView.disabled}
            onClick={() => {
              onActionFamilyChange(option.value)
              onAddStep(option.value)
            }}
            title={`Add ${option.label} step`}
            type="button"
          >
            <span className="action-palette-icon">
              <CommandIcon name={actionIcon(option.value)} />
            </span>
            <span className="action-palette-copy">
              <span className="action-palette-label">{option.label}</span>
              <span className="action-palette-hint">{actionHint(option.value)}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="step-command-grid" aria-label="Step commands">
        <ViewButton icon="plus" onClick={() => onAddStep(actionFamily)} variant="primary" view={addStepView}>
          Add step
        </ViewButton>
        <ViewButton
          icon="plus"
          onClick={() => onInsertStep(actionFamily)}
          variant="secondary"
          view={insertStepView}
        >
          Insert after selected
        </ViewButton>
      </div>
    </div>
  )
}

function SelectedStepHero({
  selected,
}: Readonly<{
  selected: SidepanelBuilderWorkbenchView['selectedStep']
}>): ReactElement {
  if (selected === undefined) {
    return (
      <div className="selected-step-hero">
        <span className="step-hero-icon" aria-hidden="true">
          <CommandIcon name="plus" />
        </span>
        <div className="selected-step-copy">
          <p className="panel-caption">Selected step</p>
          <h3>No step selected</h3>
          <p className="properties-summary">Select a step in the workflow or add a new action.</p>
        </div>
        <StatusPill status="idle">Idle</StatusPill>
      </div>
    )
  }

  const detailText = [selected.targetSummary, selected.inputSummary].filter(Boolean).join(' · ')

  return (
    <div className="selected-step-hero">
      <span className="step-hero-icon" aria-hidden="true">
        <CommandIcon name={actionIcon(selected.action)} />
      </span>
      <div className="selected-step-copy">
        <p className="panel-caption">Selected step</p>
        <h3>{selected.index + 1}. {formatActionLabel(selected.action)}</h3>
        <p className="properties-summary">
          {detailText.length === 0 ? 'No target or input configured yet' : detailText}
        </p>
      </div>
      <StatusPill status={selected.validationStatus === 'valid' ? 'ready' : 'failed'}>
        {selected.validationStatus === 'valid' ? 'Ready' : 'Needs attention'}
      </StatusPill>
    </div>
  )
}

function StepInspector({
  actionFamilyOptions,
  fields,
  onActionChange,
  onFieldChange,
}: Readonly<{
  actionFamilyOptions: readonly SidepanelActionFamilyOptionView[]
  fields: SidepanelScenarioEditorView['selectedStepFields']
  onActionChange(family: BuilderStepActionFamily): void
  onFieldChange(update: Parameters<typeof editor.updateSelectedStepFields>[0]): void
}>): ReactElement {
  return (
    <>
      <div className="property-section">
        <div className="property-section-heading">
          <h3>Action</h3>
          <span className="section-kicker">What this step does</span>
        </div>
        <div className="field-grid">
          <Field label="Action">
            <Select
              aria-label="Selected step action"
              disabled={fields.actionFamily.length === 0}
              onChange={(event) => onActionChange(event.currentTarget.value as BuilderStepActionFamily)}
              value={fields.actionFamily}
            >
              {actionFamilyOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          {fields.controls.duration ? (
            <Field label="Duration">
              <TextInput
                min={0}
                onChange={(event) => onFieldChange({ duration: event.currentTarget.value })}
                step={1}
                type="number"
                value={fields.duration}
              />
            </Field>
          ) : null}
        </div>
      </div>

      <div className="property-section">
        <div className="property-section-heading">
          <h3>Inputs</h3>
          <span className="section-kicker">Data used by the action</span>
        </div>
        <Field label="Note">
          <TextInput
            autoComplete="off"
            onChange={(event) => onFieldChange({ note: event.currentTarget.value })}
            type="text"
            value={fields.note}
          />
        </Field>
        {fields.controls.textInput ? (
          <Field label="Text input">
            <TextInput
              autoComplete="off"
              onChange={(event) => onFieldChange({ input: event.currentTarget.value })}
              type="text"
              value={fields.input}
            />
          </Field>
        ) : null}
        {fields.controls.waitText ? (
          <Field label="Wait text">
            <TextInput
              autoComplete="off"
              onChange={(event) => onFieldChange({ waitText: event.currentTarget.value })}
              type="text"
              value={fields.waitText}
            />
          </Field>
        ) : null}
        {fields.controls.scrollPosition ? (
          <fieldset className="field-set">
            <legend>Scroll position</legend>
            <div className="scroll-position-grid">
              <Field label="X">
                <TextInput
                  onChange={(event) => onFieldChange({ scrollX: event.currentTarget.value })}
                  step={1}
                  type="number"
                  value={fields.scrollX}
                />
              </Field>
              <Field label="Y">
                <TextInput
                  onChange={(event) => onFieldChange({ scrollY: event.currentTarget.value })}
                  step={1}
                  type="number"
                  value={fields.scrollY}
                />
              </Field>
              <Field label="Space">
                <Select
                  aria-label="Scroll coordinate space"
                  onChange={(event) => onFieldChange({
                    scrollCoordinateSpace: event.currentTarget.value as ScenarioCoordinateSpace,
                  })}
                  value={fields.scrollCoordinateSpace}
                >
                  <option value="viewport">Viewport</option>
                  <option value="document">Document</option>
                  <option value="screen">Screen</option>
                  <option value="surface">Surface</option>
                  <option value="element">Element</option>
                </Select>
              </Field>
            </div>
          </fieldset>
        ) : null}
      </div>
    </>
  )
}

function TargetAssignment({
  onCandidateSelect,
  onSelectTargetSlot,
  onStart,
  onStop,
  view,
}: Readonly<{
  onCandidateSelect(candidate: LocatorPreviewCandidateView): void
  onSelectTargetSlot(slotId: string): void
  onStart(slotId?: string): void
  onStop(): void
  view: SidepanelTargetAssignmentView
}>): ReactElement {
  const showLocatorPanel =
    view.locatorPreview.status !== 'idle' ||
    view.locatorPreview.candidates.length > 0 ||
    view.locatorPreview.issueSummary !== 'None'

  return (
    <div className="property-section target-property-section">
      <div className="target-assignment-panel" aria-labelledby="target-assignment-title">
        <div className="target-assignment-heading">
          <div>
            <span id="target-assignment-title" className="field-label">Targets</span>
            <p className="panel-caption">Pick page elements for this step.</p>
          </div>
          <span className="summary">{view.picker.statusSummary}</span>
        </div>
        <TargetSlotList
          onSelectTargetSlot={onSelectTargetSlot}
          onStart={onStart}
          rows={view.slots}
          startButton={view.buttons.start}
        />
        <dl className="target-assignment-fields">
          <div>
            <dt>Selected</dt>
            <dd>{view.picker.selectedSummary}</dd>
          </div>
          <div>
            <dt>Picker issue</dt>
            <dd>{view.picker.issueSummary}</dd>
          </div>
        </dl>
        <div className="toolbar">
          <ViewButton icon="target" onClick={() => onStart()} variant="secondary" view={view.buttons.start}>
            Pick target
          </ViewButton>
          <ViewButton icon="square" onClick={onStop} variant="danger" view={view.buttons.stop}>
            Stop
          </ViewButton>
        </div>
        {showLocatorPanel ? (
          <div className="locator-assignment-panel">
            <div className="target-assignment-heading">
              <span className="field-label">Locator candidates</span>
              <span className="summary">{view.locatorPreview.summary}</span>
            </div>
            <LocatorPreviewCandidates
              candidates={view.locatorPreview.candidates}
              onCandidateSelect={onCandidateSelect}
            />
            <dl className="target-assignment-fields">
              <div>
                <dt>Preview issue</dt>
                <dd>{view.locatorPreview.issueSummary}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function TargetSlotList({
  onSelectTargetSlot,
  onStart,
  rows,
  startButton,
}: Readonly<{
  onSelectTargetSlot(slotId: string): void
  onStart(slotId?: string): void
  rows: readonly SidepanelTargetSlotRowView[]
  startButton: SidepanelButtonView
}>): ReactElement {
  return (
    <ul className="target-slot-list" aria-label="Target slots">
      {rows.map((row) => (
        <li key={row.id}>
          <button
            className="target-slot-select"
            data-selected={row.selected ? 'true' : 'false'}
            data-validation={row.validationStatus}
            onClick={() => onSelectTargetSlot(row.id)}
            type="button"
          >
            <span className="target-slot-title">{row.label}</span>
            <span className="target-slot-detail">{row.summary}</span>
            <span className="target-slot-status">{row.validationStatus}</span>
          </button>
          <ViewButton
            className="target-slot-command"
            icon="target"
            onClick={() => onStart(row.id)}
            variant="secondary"
            view={startButton}
          >
            {targetSlotCommandLabel(row.summary)}
          </ViewButton>
        </li>
      ))}
    </ul>
  )
}

function LocatorPreviewCandidates({
  candidates,
  onCandidateSelect,
}: Readonly<{
  candidates: readonly LocatorPreviewCandidateView[]
  onCandidateSelect(candidate: LocatorPreviewCandidateView): void
}>): ReactElement {
  return (
    <ul className="locator-preview-list" aria-label="Locator candidates">
      {candidates.map((candidate) => (
        <li key={candidate.id} data-status={candidate.status}>
          <div className="locator-preview-main">
            <span className="locator-preview-label">{candidate.label}</span>
            <span className="locator-preview-match">{candidate.matchSummary}</span>
          </div>
          <Button
            disabled={!candidate.selectable}
            icon="check"
            onClick={() => onCandidateSelect(candidate)}
            variant="secondary"
          >
            Use
          </Button>
        </li>
      ))}
    </ul>
  )
}

function AdvancedJsonRepair({
  fields,
  onFieldChange,
}: Readonly<{
  fields: SidepanelScenarioEditorView['selectedStepFields']
  onFieldChange(update: Parameters<typeof editor.updateSelectedStepFields>[0]): void
}>): ReactElement {
  return (
    <details className="advanced-repair property-section">
      <summary>Advanced JSON repair</summary>
      <Field label="Target JSON">
        <CommitTextarea
          onCommit={(value) => onFieldChange({ targetJson: value })}
          spellCheck={false}
          value={fields.targetJson}
        />
      </Field>
      <div className="field-grid">
        <Field label="From JSON">
          <CommitTextarea
            onCommit={(value) => onFieldChange({ fromJson: value })}
            spellCheck={false}
            value={fields.fromJson}
          />
        </Field>
        <Field label="To JSON">
          <CommitTextarea
            onCommit={(value) => onFieldChange({ toJson: value })}
            spellCheck={false}
            value={fields.toJson}
          />
        </Field>
      </div>
      <Field label="Object input JSON">
        <CommitTextarea
          onCommit={(value) => onFieldChange({ inputJson: value })}
          spellCheck={false}
          value={fields.inputJson}
        />
      </Field>
      <Field label="Options JSON">
        <CommitTextarea
          onCommit={(value) => onFieldChange({ optionsJson: value })}
          spellCheck={false}
          value={fields.optionsJson}
        />
      </Field>
    </details>
  )
}

function DebugDrawer({
  onExpandedChange,
  onViewChange,
  view,
}: Readonly<{
  onExpandedChange(expanded: boolean): void
  onViewChange(view: SidepanelDebugDrawerView): void
  view: SidepanelDebugDrawerViewModel
}>): ReactElement {
  return (
    <Collapsible.Root
      asChild
      open={view.expanded}
      onOpenChange={onExpandedChange}
    >
      <section
        id="debug-drawer"
        className="debug-drawer"
        data-attention={view.attention ? 'true' : 'false'}
        data-expanded={view.expanded ? 'true' : 'false'}
        aria-labelledby="debug-drawer-title"
      >
        <div className="section-heading debug-drawer-heading">
          <div className="debug-drawer-title-group">
            <h2 id="debug-drawer-title">Diagnostics</h2>
            <span className="summary">{debugDrawerSummaryText(view)}</span>
          </div>
          <Collapsible.Trigger asChild>
            <Button
              aria-controls="debug-drawer-panel"
              icon={view.expanded ? 'arrow-up' : 'arrow-down'}
              variant="subtle"
            >
              {view.expanded ? 'Hide diagnostics' : 'Show diagnostics'}
            </Button>
          </Collapsible.Trigger>
        </div>
        <Collapsible.Content id="debug-drawer-panel" className="debug-drawer-panel">
          <Tabs.Root
            className="debug-tabs-root"
            onValueChange={(value) => {
              if (isDebugDrawerView(value)) {
                onViewChange(value)
              }
            }}
            value={view.activeView}
          >
            <Tabs.List className="debug-drawer-tabs" aria-label="Diagnostics views">
              <Tabs.Trigger value="validation">Issues</Tabs.Trigger>
              <Tabs.Trigger value="locator">Locator candidates</Tabs.Trigger>
              <Tabs.Trigger value="run-trace">Run trace</Tabs.Trigger>
              <Tabs.Trigger value="failure">Failure</Tabs.Trigger>
            </Tabs.List>

            <Tabs.Content className="debug-panel" value="validation">
              <dl className="debug-fields">
                <div>
                  <dt>Summary</dt>
                  <dd>{view.views.validation.summary}</dd>
                </div>
              </dl>
              <IssuesList issues={view.views.validation.issues} />
            </Tabs.Content>

            <Tabs.Content className="debug-panel" value="locator">
              <dl className="debug-fields">
                <div>
                  <dt>Status</dt>
                  <dd>{view.views.locator.summary}</dd>
                </div>
                <div>
                  <dt>Issue</dt>
                  <dd>{view.views.locator.issueSummary}</dd>
                </div>
              </dl>
              <DebugLocatorCandidates candidates={view.views.locator.candidates} />
            </Tabs.Content>

            <Tabs.Content className="debug-panel" value="run-trace">
              <dl className="debug-fields">
                <div>
                  <dt>Run</dt>
                  <dd>{view.views.runTrace.runId ?? 'None'}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{capitalize(view.views.runTrace.status ?? 'idle')}</dd>
                </div>
                <div>
                  <dt>Summary</dt>
                  <dd>{view.views.runTrace.summary}</dd>
                </div>
                <div>
                  <dt>Latest event</dt>
                  <dd>{latestDebugEventSummary(view.views.runTrace)}</dd>
                </div>
              </dl>
            </Tabs.Content>

            <Tabs.Content className="debug-panel" value="failure">
              <dl className="debug-fields">
                <div>
                  <dt>Failure</dt>
                  <dd>{view.views.failure.message ?? 'None'}</dd>
                </div>
                <div>
                  <dt>Step</dt>
                  <dd>{view.views.failure.stepId ?? 'None'}</dd>
                </div>
                <div>
                  <dt>Event</dt>
                  <dd>{view.views.failure.eventName ?? 'None'}</dd>
                </div>
              </dl>
              <pre className="debug-json">
                {view.views.failure.details === undefined
                  ? 'None'
                  : JSON.stringify(view.views.failure.details, null, 2)}
              </pre>
            </Tabs.Content>
          </Tabs.Root>
        </Collapsible.Content>
      </section>
    </Collapsible.Root>
  )
}

function IssuesList({
  issues,
}: Readonly<{
  issues: readonly SidepanelIssueView[]
}>): ReactElement {
  return (
    <ul className="issue-list" aria-live="polite">
      {issues.map((issue, index) => (
        <li key={`${issue.path}-${index}`} title={`${issue.path}: ${issue.message}`}>
          <span className="issue-path">{issue.path}</span>
          <span>{issue.message}</span>
        </li>
      ))}
    </ul>
  )
}

function DebugLocatorCandidates({
  candidates,
}: Readonly<{
  candidates: readonly LocatorPreviewCandidateView[]
}>): ReactElement {
  return (
    <ul className="debug-locator-candidates" aria-label="Debug locator candidates">
      {candidates.map((candidate) => (
        <li key={candidate.id} data-status={candidate.status}>
          <span className="debug-locator-label">{candidate.label}</span>
          <span className="debug-locator-detail">
            {candidate.matchSummary} · {candidate.status}
          </span>
        </li>
      ))}
    </ul>
  )
}

function ViewButton({
  children,
  className,
  icon,
  iconOnly,
  onClick,
  tooltip,
  variant,
  view,
}: Readonly<{
  children: string
  className?: string
  icon?: CommandIconName
  iconOnly?: boolean
  onClick(): void
  tooltip?: string
  variant: ButtonVariant
  view: SidepanelButtonView
}>): ReactElement {
  return (
    <Button
      className={className}
      disabled={view.disabled}
      icon={icon}
      iconOnly={iconOnly}
      onClick={onClick}
      pending={view.pending}
      tooltip={tooltip}
      variant={variant}
    >
      {children}
    </Button>
  )
}

function CommitTextarea({
  onCommit,
  value,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> &
  Readonly<{
    onCommit(value: string): void
    value: string
  }>): ReactElement {
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    setDraft(value)
  }, [value])

  return (
    <Textarea
      {...props}
      onBlur={() => onCommit(draft)}
      onChange={(event) => setDraft(event.currentTarget.value)}
      value={draft}
    />
  )
}

function selectedPaletteFamily(
  preferred: BuilderStepActionFamily,
  options: readonly SidepanelActionFamilyOptionView[],
  selectedStepFamily: BuilderStepActionFamily | '',
): BuilderStepActionFamily {
  if (options.some((option) => option.value === preferred)) {
    return preferred
  }

  if (selectedStepFamily !== '' && options.some((option) => option.value === selectedStepFamily)) {
    return selectedStepFamily
  }

  return options[0]?.value ?? 'click'
}

function targetSlotCommandLabel(summary: string): string {
  return summary === 'no locators' || summary === 'current' ? 'Set target' : 'Change target'
}

function recordSummary(snapshot: SidepanelScenarioEditorSnapshot): string {
  const record = snapshot.currentRecord
  if (record === undefined) {
    return 'Not recording'
  }

  if (record.status === 'recording') {
    return 'Recording'
  }

  if (record.status === 'failed') {
    return record.message === undefined ? 'Recording failed' : `Recording failed: ${record.message}`
  }

  return record.draftId === undefined ? 'Recording stopped' : 'Draft ready'
}

function selectedStepSummary(snapshot: SidepanelScenarioEditorSnapshot): string {
  const step = snapshot.draftDocument?.steps[snapshot.selectedStepIndex]
  return step === undefined
    ? 'No step selected'
    : `Step ${snapshot.selectedStepIndex + 1} · ${formatActionLabel(step.action)}`
}

function latestDebugEventSummary(
  traceView: SidepanelDebugDrawerViewModel['views']['runTrace'],
): string {
  if (traceView.latestEventName === undefined) {
    return 'No trace events'
  }

  return [
    traceView.latestEventName,
    traceView.latestEventMessage,
  ].filter((part) => part !== undefined && part.length > 0).join(' · ')
}

function debugDrawerSummaryText(view: SidepanelDebugDrawerViewModel): string {
  if (view.views.failure.message !== undefined) {
    return 'Run failure'
  }

  if (view.views.validation.issueCount > 0) {
    const count = view.views.validation.issueCount
    return `${count} issue${count === 1 ? '' : 's'}`
  }

  if (view.views.locator.issueSummary !== 'None') {
    return 'Locator issue'
  }

  return view.views.runTrace.eventCount > 0
    ? view.views.runTrace.summary
    : view.views.validation.summary
}

function isDebugDrawerView(value: string): value is SidepanelDebugDrawerView {
  return value === 'validation' ||
    value === 'locator' ||
    value === 'run-trace' ||
    value === 'failure'
}

function isFailedRuntimeStatusMessage(message: unknown): boolean {
  if (typeof message !== 'object' || message === null) {
    return false
  }

  const candidate = message as Readonly<{
    kind?: unknown
    payload?: Readonly<{ status?: unknown }>
  }>
  return candidate.kind === 'runtime:status' && candidate.payload?.status === 'failed'
}

const root = document.querySelector('#root')
if (root === null) {
  throw new Error('Missing sidepanel root element.')
}

createRoot(root).render(<SidepanelApp />)
