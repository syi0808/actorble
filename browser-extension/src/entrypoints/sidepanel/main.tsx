import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type RefObject,
  type TextareaHTMLAttributes,
} from 'react'
import { createRoot } from 'react-dom/client'
import {
  Collapsible,
  Select as RadixSelect,
  Tabs,
} from 'radix-ui'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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
  BrandWordmark,
  Field,
  OverflowMenu,
  Select,
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

type PendingWorkflowStep = Readonly<{
  id: 'pending-step'
}>

function SidepanelApp(): ReactElement {
  const [, forceRender] = useState(0)
  const [debugDrawerState, setDebugDrawerState] = useState<SidepanelDebugDrawerState>({})
  const [pendingStep, setPendingStep] = useState<PendingWorkflowStep | undefined>()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const snapshot = editor.getSnapshot()
  const editorView = createSidepanelScenarioEditorView(snapshot)
  const recomposedView = createSidepanelRecompositionViewModel({
    editor: snapshot,
    targetPicker: targetPicker.getSnapshot(),
    locatorPreview: locatorPreviewer.getSnapshot(),
    debugDrawer: debugDrawerState,
  })
  const defaultActionFamily = useMemo(
    () => defaultWorkflowActionFamily(
      editorView.actionFamilyOptions,
      editorView.selectedStepFields.actionFamily,
    ),
    [editorView.actionFamilyOptions, editorView.selectedStepFields.actionFamily],
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
  const exportSelectedScenario = useCallback(async (format: ExportFormat): Promise<void> => {
    if (format === 'typescript') {
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
  }, [refreshView])

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

  useEffect(() => {
    setPendingStep(undefined)
  }, [snapshot.draftDocument?.id, snapshot.selectedScenarioId])

  return (
    <UiProvider>
      <main>
        <AppHeader />
        <ScenarioShell
          fileInputRef={fileInputRef}
          onCreate={() => {
            editor.createScenario({
              name: 'Untitled scenario',
              initialStepFamily: defaultActionFamily,
            })
            setPendingStep(undefined)
            refreshView()
          }}
          onExport={(format) => void exportSelectedScenario(format)}
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
            setPendingStep(undefined)
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
          pendingStepOpen={pendingStep !== undefined}
          onRecordedDraftAction={(action) => {
            setPendingStep(undefined)
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
          editorView={editorView}
          onAddPendingStep={() => {
            setPendingStep({ id: 'pending-step' })
          }}
          onCancelPendingStep={() => {
            setPendingStep(undefined)
          }}
          onCommitPendingStep={(family) => {
            editor.addStep(family)
            setPendingStep(undefined)
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
          onMoveStep={(delta) => {
            editor.moveSelectedStep(delta)
            refreshView()
          }}
          onReorderStep={(stepId, toIndex) => {
            editor.reorderStep(stepId, toIndex)
            refreshView()
          }}
          onSelectStep={(index) => {
            setPendingStep(undefined)
            editor.selectStep(index)
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
          onTestStep={() => void runAction(() => editor.dryRunSelectedStep())}
          pendingStep={pendingStep}
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

function AppHeader(): ReactElement {
  return (
    <header className="app-header">
      <div className="brand-lockup">
        <BrandWordmark />
        <h1>Scenario builder</h1>
      </div>
    </header>
  )
}

function ScenarioShell({
  fileInputRef,
  onCreate,
  onExport,
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
  pendingStepOpen,
}: Readonly<{
  fileInputRef: RefObject<HTMLInputElement | null>
  onCreate(): void
  onExport(format: ExportFormat): void
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
  pendingStepOpen: boolean
}>): ReactElement {
  const activityItems = scenarioActivityItems(shell, snapshot)
  const recordActive = snapshot.currentRecord?.status === 'recording'
  const runView = blockedButtonView(shell.buttons.run, pendingStepOpen)
  const saveView = blockedButtonView(shell.buttons.save, pendingStepOpen)
  const validateView = blockedButtonView(shell.buttons.validate, pendingStepOpen)

  return (
    <section id="scenario-shell" className="scenario-shell" aria-labelledby="scenario-shell-title">
      <div className="scenario-shell-top">
        <div className="section-heading">
          <h2 id="scenario-shell-title">Scenario</h2>
          {shell.dirty ? <span className="summary">Unsaved changes</span> : null}
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
        <input
          ref={fileInputRef}
          accept="application/json,.json"
          className="hidden-file-input"
          disabled={shell.buttons.import.disabled}
          onChange={(event) => onImport(event.currentTarget.files?.[0])}
          type="file"
        />
        {recordActive ? (
          <ViewButton
            icon="square"
            onClick={onRecord}
            variant="danger"
            view={shell.buttons.record}
          >
            {shell.buttons.record.label}
          </ViewButton>
        ) : (
          <ViewButton icon="play" onClick={onRun} variant="primary" view={runView}>
            {runView.label}
          </ViewButton>
        )}
        <ViewButton icon="save" onClick={onSave} variant="secondary" view={saveView}>
          Save
        </ViewButton>
        <OverflowMenu
          items={[
            {
              label: 'New scenario',
              icon: 'plus',
              disabled: shell.buttons.create.disabled,
              onSelect: onCreate,
            },
            {
              label: 'Check scenario',
              icon: 'check',
              disabled: validateView.disabled,
              onSelect: onValidate,
            },
            {
              label: 'Record',
              icon: 'record',
              disabled: shell.buttons.record.disabled || recordActive,
              onSelect: onRecord,
            },
            {
              label: 'Import',
              icon: 'file-up',
              disabled: shell.buttons.import.disabled,
              onSelect: () => fileInputRef.current?.click(),
            },
            {
              label: 'Export JSON',
              icon: 'download',
              disabled: shell.buttons.export.disabled,
              onSelect: () => onExport('json'),
            },
            {
              label: 'Export TypeScript',
              icon: 'download',
              disabled: shell.buttons.export.disabled,
              onSelect: () => onExport('typescript'),
            },
          ]}
        />
      </div>
      {activityItems.length === 0 ? null : (
        <dl className="scenario-activity" aria-label="Scenario activity">
          {activityItems.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
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
        <OverflowMenu
          items={[
            {
              label: 'Save as new',
              icon: 'save',
              disabled: review.buttons.saveAsNew.disabled,
              onSelect: () => onAction('save-as-new'),
            },
            {
              label: 'Export draft',
              icon: 'download',
              disabled: review.buttons.export.disabled,
              onSelect: () => onAction('export'),
            },
            {
              label: 'Discard',
              icon: 'trash',
              danger: true,
              disabled: review.buttons.discard.disabled,
              onSelect: () => onAction('discard'),
            },
          ]}
        />
      </div>
    </div>
  )
}

function BuilderWorkbench({
  editorView,
  onAddPendingStep,
  onCancelPendingStep,
  onCandidateSelect,
  onCommitPendingStep,
  onDeleteStep,
  onDuplicateStep,
  onMoveStep,
  onReorderStep,
  onSelectStep,
  onStartTargetAssignment,
  onStepActionChange,
  onStepFieldChange,
  onTestStep,
  pendingStep,
  snapshot,
  targetAssignment,
  workbench,
}: Readonly<{
  editorView: SidepanelScenarioEditorView
  onAddPendingStep(): void
  onCancelPendingStep(): void
  onCandidateSelect(candidate: LocatorPreviewCandidateView): void
  onCommitPendingStep(family: BuilderStepActionFamily): void
  onDeleteStep(): void
  onDuplicateStep(): void
  onMoveStep(delta: -1 | 1): void
  onReorderStep(stepId: string, toIndex: number): void
  onSelectStep(index: number): void
  onStartTargetAssignment(slotId?: string): void
  onStepActionChange(family: BuilderStepActionFamily): void
  onStepFieldChange(update: Parameters<typeof editor.updateSelectedStepFields>[0]): void
  onTestStep(): void
  pendingStep: PendingWorkflowStep | undefined
  snapshot: SidepanelScenarioEditorSnapshot
  targetAssignment: SidepanelTargetAssignmentView
  workbench: SidepanelBuilderWorkbenchView
}>): ReactElement {
  const selectedSummary = selectedStepSummary(snapshot)
  const stepIds = useMemo(
    () => workbench.steps.map((step) => step.id),
    [workbench.steps],
  )
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )
  const handleDragEnd = useCallback((event: DragEndEvent): void => {
    const overId = event.over?.id
    if (overId === undefined || event.active.id === overId) {
      return
    }

    const toIndex = workbench.steps.findIndex((step) => step.id === String(overId))
    if (toIndex < 0) {
      return
    }

    onReorderStep(String(event.active.id), toIndex)
  }, [onReorderStep, workbench.steps])
  const disableDrag = pendingStep !== undefined || snapshot.pendingAction !== null

  return (
    <section id="builder-workbench" aria-labelledby="builder-workbench-title">
      <div className="section-heading builder-heading">
        <h2 id="builder-workbench-title">Workflow</h2>
        {selectedSummary === '' ? null : (
          <span className="summary">{selectedSummary}</span>
        )}
      </div>

      <DndContext
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
        sensors={sensors}
      >
        <SortableContext items={stepIds} strategy={verticalListSortingStrategy}>
          <ul className="step-list workflow-step-list" aria-label="Scenario steps">
            {workbench.steps.map((row) => (
              <SortableWorkflowStepCard
                key={row.id}
                actionFamilyOptions={editorView.actionFamilyOptions}
                disabled={disableDrag}
                expanded={row.selected && pendingStep === undefined}
                onCandidateSelect={onCandidateSelect}
                onDeleteStep={onDeleteStep}
                onDuplicateStep={onDuplicateStep}
                onMoveStep={onMoveStep}
                onSelectStep={onSelectStep}
                onStartTargetAssignment={onStartTargetAssignment}
                onStepActionChange={onStepActionChange}
                onStepFieldChange={onStepFieldChange}
                onTestStep={onTestStep}
                row={row}
                targetAssignment={targetAssignment}
                view={workbench}
              />
            ))}
            {pendingStep === undefined ? null : (
              <PendingWorkflowStepCard
                addStepView={workbench.buttons.addStep}
                nextIndex={workbench.steps.length}
                onActionChange={onCommitPendingStep}
                onCancel={onCancelPendingStep}
                options={workbench.actionFamilyOptions}
              />
            )}
          </ul>
        </SortableContext>
      </DndContext>
      {pendingStep === undefined ? (
        <div className="workflow-add-row">
          <ViewButton
            icon="plus"
            iconOnly
            onClick={onAddPendingStep}
            tooltip="Add step"
            variant="primary"
            view={workbench.buttons.addStep}
          >
            Add step
          </ViewButton>
        </div>
      ) : null}
    </section>
  )
}

function SortableWorkflowStepCard({
  actionFamilyOptions,
  disabled,
  expanded,
  onCandidateSelect,
  onDeleteStep,
  onDuplicateStep,
  onMoveStep,
  onSelectStep,
  onStartTargetAssignment,
  onStepActionChange,
  onStepFieldChange,
  onTestStep,
  row,
  targetAssignment,
  view,
}: Readonly<{
  actionFamilyOptions: readonly SidepanelActionFamilyOptionView[]
  disabled: boolean
  expanded: boolean
  onCandidateSelect(candidate: LocatorPreviewCandidateView): void
  onDeleteStep(): void
  onDuplicateStep(): void
  onMoveStep(delta: -1 | 1): void
  onSelectStep(index: number): void
  onStartTargetAssignment(slotId?: string): void
  onStepActionChange(family: BuilderStepActionFamily): void
  onStepFieldChange(update: Parameters<typeof editor.updateSelectedStepFields>[0]): void
  onTestStep(): void
  row: SidepanelStepRowView
  targetAssignment: SidepanelTargetAssignmentView
  view: SidepanelBuilderWorkbenchView
}>): ReactElement {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: row.id,
    disabled,
  })
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <li
      ref={setNodeRef}
      className="workflow-step-list-item"
      data-dragging={isDragging ? 'true' : 'false'}
      style={style}
    >
      <WorkflowStepCard
        actionFamilyOptions={actionFamilyOptions}
        dragAttributes={attributes}
        dragDisabled={disabled}
        dragListeners={listeners}
        expanded={expanded}
        onCandidateSelect={onCandidateSelect}
        onDeleteStep={onDeleteStep}
        onDuplicateStep={onDuplicateStep}
        onMoveStep={onMoveStep}
        onSelectStep={onSelectStep}
        onStartTargetAssignment={onStartTargetAssignment}
        onStepActionChange={onStepActionChange}
        onStepFieldChange={onStepFieldChange}
        onTestStep={onTestStep}
        row={row}
        targetAssignment={targetAssignment}
        view={view}
      />
    </li>
  )
}

function WorkflowStepCard({
  actionFamilyOptions,
  dragAttributes,
  dragDisabled,
  dragListeners,
  expanded,
  onCandidateSelect,
  onDeleteStep,
  onDuplicateStep,
  onMoveStep,
  onSelectStep,
  onStartTargetAssignment,
  onStepActionChange,
  onStepFieldChange,
  onTestStep,
  row,
  targetAssignment,
  view,
}: Readonly<{
  actionFamilyOptions: readonly SidepanelActionFamilyOptionView[]
  dragAttributes: ReturnType<typeof useSortable>['attributes']
  dragDisabled: boolean
  dragListeners: ReturnType<typeof useSortable>['listeners']
  expanded: boolean
  onCandidateSelect(candidate: LocatorPreviewCandidateView): void
  onDeleteStep(): void
  onDuplicateStep(): void
  onMoveStep(delta: -1 | 1): void
  onSelectStep(index: number): void
  onStartTargetAssignment(slotId?: string): void
  onStepActionChange(family: BuilderStepActionFamily): void
  onStepFieldChange(update: Parameters<typeof editor.updateSelectedStepFields>[0]): void
  onTestStep(): void
  row: SidepanelStepRowView
  targetAssignment: SidepanelTargetAssignmentView
  view: SidepanelBuilderWorkbenchView
}>): ReactElement {
  const detailText = [row.targetSummary, row.inputSummary].filter(Boolean).join(' · ')
  const selected = view.selectedStep?.id === row.id ? view.selectedStep : undefined

  return (
    <article
      className="step-card workflow-step-card"
      data-expanded={expanded ? 'true' : 'false'}
      data-selected={row.selected ? 'true' : 'false'}
      data-validation={row.validationStatus}
    >
      <div className="step-card-header">
        <button
          {...dragAttributes}
          {...(dragListeners ?? {})}
          aria-label={`Move step ${row.index + 1}`}
          className="step-drag-handle"
          disabled={dragDisabled}
          type="button"
        >
          <CommandIcon name="grab" />
        </button>
        <button
          className="step-card-summary"
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
      </div>
      {expanded && selected !== undefined ? (
        <div className="expanded-step-editor">
          <div className="selected-step-actions inline-step-actions" aria-label="Selected step actions">
            <ViewButton icon="play" onClick={onTestStep} variant="secondary" view={view.buttons.dryRun}>
              Test step
            </ViewButton>
            <OverflowMenu
              items={[
                {
                  label: 'Duplicate',
                  icon: 'copy',
                  disabled: view.buttons.duplicateStep.disabled,
                  onSelect: onDuplicateStep,
                },
                {
                  label: 'Move up',
                  icon: 'arrow-up',
                  disabled: view.buttons.moveStepUp.disabled,
                  onSelect: () => onMoveStep(-1),
                },
                {
                  label: 'Move down',
                  icon: 'arrow-down',
                  disabled: view.buttons.moveStepDown.disabled,
                  onSelect: () => onMoveStep(1),
                },
                {
                  label: 'Delete',
                  icon: 'trash',
                  danger: true,
                  disabled: view.buttons.deleteStep.disabled,
                  onSelect: onDeleteStep,
                },
              ]}
            />
          </div>
          <StepInspector
            actionFamilyOptions={actionFamilyOptions}
            fields={selected.fields}
            onActionChange={onStepActionChange}
            onFieldChange={onStepFieldChange}
          />
          {selected.fields.controls.targetSlots ? (
            <TargetAssignment
              onCandidateSelect={onCandidateSelect}
              onStart={onStartTargetAssignment}
              view={targetAssignment}
            />
          ) : null}
          <AdvancedJsonRepair
            fields={selected.fields}
            onFieldChange={onStepFieldChange}
          />
        </div>
      ) : null}
    </article>
  )
}

function PendingWorkflowStepCard({
  addStepView,
  nextIndex,
  onActionChange,
  onCancel,
  options,
}: Readonly<{
  addStepView: SidepanelButtonView
  nextIndex: number
  onActionChange(family: BuilderStepActionFamily): void
  onCancel(): void
  options: readonly SidepanelActionFamilyOptionView[]
}>): ReactElement {
  return (
    <li className="workflow-step-list-item pending-step-list-item">
      <article
        className="step-card workflow-step-card pending-step-card"
        data-expanded="true"
        data-selected="true"
        data-validation="pending"
      >
        <div className="step-card-header">
          <span className="step-drag-placeholder" aria-hidden="true" />
          <div className="step-card-summary pending-step-summary">
            <span className="step-index">{nextIndex + 1}</span>
            <span className="step-card-icon">
              <CommandIcon name="plus" />
            </span>
            <span className="step-card-main">
              <span className="step-title">New step</span>
              <span className="step-detail">Choose an action to add it to the workflow</span>
            </span>
            <Button icon="trash" onClick={onCancel} variant="subtle">
              Cancel
            </Button>
          </div>
        </div>
        <div className="expanded-step-editor">
          <div className="property-section pending-step-section">
            <div className="property-section-heading">
              <h3>Action</h3>
              <span className="section-kicker">What this step does</span>
            </div>
            <Field label="Action">
              <ActionFamilySelect
                ariaLabel="New step action"
                autoFocus
                disabled={addStepView.disabled}
                onChange={onActionChange}
                options={options}
                placeholder="Choose action"
                value=""
              />
            </Field>
          </div>
        </div>
      </article>
    </li>
  )
}

function ActionFamilySelect({
  ariaLabel,
  autoFocus = false,
  disabled = false,
  onChange,
  options,
  placeholder = 'Choose action',
  value,
}: Readonly<{
  ariaLabel: string
  autoFocus?: boolean
  disabled?: boolean
  onChange(family: BuilderStepActionFamily): void
  options: readonly SidepanelActionFamilyOptionView[]
  placeholder?: string
  value: BuilderStepActionFamily | ''
}>): ReactElement {
  const selected = options.find((option) => option.value === value)
  const triggerIcon = selected === undefined ? 'target' : actionIcon(selected.value)

  return (
    <RadixSelect.Root
      disabled={disabled}
      onValueChange={(nextValue) => onChange(nextValue as BuilderStepActionFamily)}
      value={value === '' ? undefined : value}
    >
      <RadixSelect.Trigger
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        className="action-select-trigger"
      >
        <span className="action-select-trigger-icon">
          <CommandIcon name={triggerIcon} />
        </span>
        <span className="action-select-trigger-copy">
          <span className="action-select-trigger-label">
            {selected?.label ?? placeholder}
          </span>
          <span className="action-select-trigger-hint">
            {selected === undefined ? 'Select from available actions' : actionHint(selected.value)}
          </span>
        </span>
        <CommandIcon className="action-select-chevron" name="arrow-down" />
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          className="action-select-content"
          position="popper"
          sideOffset={6}
        >
          <RadixSelect.Viewport className="action-select-viewport">
            {options.map((option) => (
              <RadixSelect.Item
                key={option.value}
                className="action-select-item"
                value={option.value}
              >
                <span className="action-select-item-icon">
                  <CommandIcon name={actionIcon(option.value)} />
                </span>
                <span className="action-select-item-copy">
                  <RadixSelect.ItemText className="action-select-item-label">
                    {option.label}
                  </RadixSelect.ItemText>
                  <span className="action-select-item-hint">{actionHint(option.value)}</span>
                </span>
                <RadixSelect.ItemIndicator className="action-select-item-indicator">
                  <CommandIcon name="check" />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
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
            <ActionFamilySelect
              ariaLabel="Selected step action"
              disabled={fields.actionFamily.length === 0}
              onChange={onActionChange}
              options={actionFamilyOptions}
              value={fields.actionFamily}
            />
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
  onStart,
  view,
}: Readonly<{
  onCandidateSelect(candidate: LocatorPreviewCandidateView): void
  onStart(slotId?: string): void
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
  onStart,
  rows,
  startButton,
}: Readonly<{
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
            disabled={startButton.disabled}
            onClick={() => onStart(row.id)}
            type="button"
          >
            <span className="target-slot-title">{row.label}</span>
            <span className="target-slot-detail">{row.summary}</span>
            <span className="target-slot-status">
              {startButton.pending ? 'Picking' : targetSlotCommandLabel(row.summary)}
            </span>
          </button>
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

function blockedButtonView(
  view: SidepanelButtonView,
  blocked: boolean,
): SidepanelButtonView {
  return blocked
    ? {
        ...view,
        disabled: true,
        pending: false,
      }
    : view
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

function defaultWorkflowActionFamily(
  options: readonly SidepanelActionFamilyOptionView[],
  selectedStepFamily: BuilderStepActionFamily | '',
): BuilderStepActionFamily {
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

function scenarioActivityItems(
  shell: SidepanelScenarioShellView,
  snapshot: SidepanelScenarioEditorSnapshot,
): readonly Readonly<{ label: string; value: string }>[] {
  const items: Readonly<{ label: string; value: string }>[] = []

  if (shell.targetTab.status === 'checking' || shell.targetTab.status === 'blocked') {
    items.push({ label: 'Target', value: shell.targetTab.summary })
  }

  if (snapshot.currentRun !== undefined) {
    items.push({
      label: 'Run',
      value: snapshot.currentTrace?.summary ?? capitalize(snapshot.currentRun.status),
    })
  }

  if (snapshot.currentRecord !== undefined) {
    items.push({ label: 'Recording', value: recordSummary(snapshot) })
  }

  if (
    shell.message !== undefined &&
    shell.message.length > 0 &&
    !items.some((item) => item.value === shell.message)
  ) {
    items.push({ label: 'Message', value: shell.message })
  }

  return items
}

function selectedStepSummary(snapshot: SidepanelScenarioEditorSnapshot): string {
  const step = snapshot.draftDocument?.steps[snapshot.selectedStepIndex]
  return step === undefined
    ? ''
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
