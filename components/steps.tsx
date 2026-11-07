'use client';
import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { createStep, deleteStep, reorderSteps, updateStep, type ActionState } from '@/app/actions';
import { modelName, pickable } from '@/lib/models';
import type { InputType, Model, OutputType, Step } from '@/lib/types';
import { PromptField } from './prompt-field';
import { Icon } from './icons';

function StepFields({ step, position, inputType, models }: { step?: Step; position: number; inputType: InputType; models: Model[] }) {
  const [outputType, setOutputType] = useState<OutputType>(step?.output_type ?? 'text');
  const options = pickable(models, outputType, step?.llm_model_id);
  const current = step && step.output_type === outputType ? step.llm_model_id : options[0]?.id ?? null;
  return (
    <>
      <label className="field"><span>Step name</span><input type="text" name="title" required maxLength={120} defaultValue={step?.title ?? ''} placeholder="e.g. Write five captions" /></label>
      <div className="grid2">
        <label className="field"><span>Output</span>
          <select name="output_type" value={outputType} onChange={(e) => setOutputType(e.target.value as OutputType)}>
            <option value="text">Text</option><option value="image">Image</option>
          </select>
        </label>
        <label className="field"><span>Model</span>
          <select name="llm_model_id" key={outputType} defaultValue={current ?? ''}>
            {outputType === 'text' && <option value="">No model call (passes the previous output through)</option>}
            {options.map((m) => <option key={m.id} value={m.id}>{m.name}{m.accepts_images ? ' · reads images' : ''}{m.is_active ? '' : ' (inactive)'}</option>)}
          </select>
        </label>
      </div>
      <PromptField position={position} defaultValue={step?.instructions ?? ''} inputType={inputType} />
      {inputType === 'image' && (
        <label className="check"><input type="checkbox" name="attach_input_image" defaultChecked={step?.attach_input_image ?? position === 1} />
          <span>Show the chain&apos;s input image to the model<br /><span className="muted small">{outputType === 'image' ? 'Used as a reference image by models that accept one.' : 'Lets the model see the picture, not just earlier text.'}</span></span>
        </label>
      )}
    </>
  );
}

function StepEditor({ step, inputType, models, onDone }: { step: Step; inputType: InputType; models: Model[]; onDone: () => void }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateStep, { error: '' });
  useEffect(() => { if (state.ok) onDone(); }, [state, onDone]);
  return (
    <form action={action} className="form stepedit">
      <input type="hidden" name="id" value={step.id} />
      <StepFields step={step} position={step.step_order} inputType={inputType} models={models} />
      {state.error && <p className="notice error" role="alert">{state.error}</p>}
      <div className="savebar">
        <button type="button" className="btn ghost" onClick={onDone}>Cancel</button>
        <button className="btn primary" disabled={pending}>{pending ? 'Saving…' : 'Save step'}</button>
      </div>
    </form>
  );
}

function DeleteStep({ step }: { step: Step }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState<ActionState, FormData>(deleteStep, { error: '' });
  useEffect(() => { if (state.ok) dialog.current?.close(); }, [state]);
  return (
    <>
      <button type="button" className="iconbtn" aria-label={`Delete step ${step.step_order}`} title="Delete step" onClick={() => dialog.current?.showModal()}><Icon.trash /></button>
      <dialog ref={dialog} aria-labelledby={`del-step-${step.id}`}>
        <h2 id={`del-step-${step.id}`}>Delete step {step.step_order}?</h2>
        <p className="muted">“{step.title}” will be removed and later steps move up. References to later steps are renumbered automatically. Past runs keep their record of it.</p>
        <form action={action}>
          <input type="hidden" name="id" value={step.id} />
          {state.error && <p className="notice error" role="alert">{state.error}</p>}
          <div className="row">
            <button type="button" className="btn" onClick={() => dialog.current?.close()}>Cancel</button>
            <button className="btn danger" disabled={pending}>{pending ? 'Deleting…' : 'Delete step'}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}

function AddStep({ chainId, position, inputType, models }: { chainId: number; position: number; inputType: InputType; models: Model[] }) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [state, action, pending] = useActionState<ActionState, FormData>(createStep, { error: '' });
  useEffect(() => { if (state.ok) { setOpen(false); setFormKey((k) => k + 1); } }, [state]);
  if (!open) return <button type="button" className="addstep" onClick={() => setOpen(true)}><Icon.plus />Add step {position}</button>;
  return (
    <div className="card">
      <div className="cardhead"><h2>New step {position}</h2></div>
      <form action={action} className="form" key={formKey}>
        <input type="hidden" name="prompt_chain_id" value={chainId} />
        <StepFields position={position} inputType={inputType} models={models} />
        {state.error && <p className="notice error" role="alert">{state.error}</p>}
        <div className="savebar">
          <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn primary" disabled={pending}>{pending ? 'Adding…' : 'Add step'}</button>
        </div>
      </form>
    </div>
  );
}

export function StepList({ chainId, steps, inputType, models, maxSteps }: { chainId: number; steps: Step[]; inputType: InputType; models: Model[]; maxSteps: number }) {
  const [order, setOrder] = useState(steps);
  const [editing, setEditing] = useState<number | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [drop, setDrop] = useState<{ id: number; after: boolean } | null>(null);
  const [message, setMessage] = useState<ActionState>({ error: '' });
  const [pending, startTransition] = useTransition();

  useEffect(() => { setOrder(steps); }, [steps]);

  function commit(next: Step[]) {
    const previous = order;
    if (next.every((s, i) => s.id === previous[i]?.id)) return;
    setOrder(next.map((s, i) => ({ ...s, step_order: i + 1 })));
    startTransition(async () => {
      const result = await reorderSteps(chainId, next.map((s) => s.id));
      setMessage(result);
      if (result.error) setOrder(previous);
    });
  }
  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  }
  function onDrop() {
    if (dragId == null || !drop || dragId === drop.id) return reset();
    const moving = order.find((s) => s.id === dragId)!;
    const rest = order.filter((s) => s.id !== dragId);
    let at = rest.findIndex((s) => s.id === drop.id);
    if (drop.after) at += 1;
    rest.splice(at, 0, moving);
    reset();
    commit(rest);
  }
  function reset() { setDragId(null); setDrop(null); }

  return (
    <div>
      <div className="cardhead">
        <h2>Steps <span className="muted small">({order.length})</span></h2>
        <span className="muted small" aria-live="polite">{pending ? <><span className="spinner" /> Saving order…</> : message.ok ?? ''}</span>
      </div>
      {message.error && <p className="notice error" role="alert" style={{ marginBottom: 12 }}>{message.error}</p>}
      {order.length === 0 && <p className="muted">No steps yet. Add the first one below.</p>}
      <ol className="steps">
        {order.map((step, index) => {
          const cls = ['step', step.output_type === 'image' ? 'image' : '', dragId === step.id ? 'dragging' : '',
            drop?.id === step.id && dragId !== step.id ? (drop.after ? 'dropafter' : 'dropbefore') : ''].join(' ');
          return (
            <li key={step.id} className={cls}
              onDragOver={(e) => { if (dragId == null) return; e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setDrop({ id: step.id, after: e.clientY > r.top + r.height / 2 }); }}
              onDrop={(e) => { e.preventDefault(); onDrop(); }}>
              <div className="stepnum" aria-hidden="true">{index + 1}</div>
              <div className="stepbody">
                <div className="stephead">
                  <button type="button" className="handle" draggable={editing == null} aria-label={`Drag to reorder step ${index + 1}`} title="Drag to reorder"
                    onDragStart={(e) => { setDragId(step.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(step.id)); }}
                    onDragEnd={reset}><Icon.grip /></button>
                  <button type="button" className="steptitle" onClick={() => setEditing(editing === step.id ? null : step.id)} aria-expanded={editing === step.id}>
                    <b>{step.title}</b>
                    <span>{step.output_type === 'image' ? 'Image' : 'Text'} · {modelName(models, step.llm_model_id)}{step.attach_input_image && inputType === 'image' ? ' · sees input image' : ''}</span>
                  </button>
                  <div className="stepactions">
                    <button type="button" className="iconbtn" aria-label={`Move step ${index + 1} up`} title="Move up" disabled={index === 0 || pending} onClick={() => move(index, -1)}><Icon.up /></button>
                    <button type="button" className="iconbtn" aria-label={`Move step ${index + 1} down`} title="Move down" disabled={index === order.length - 1 || pending} onClick={() => move(index, 1)}><Icon.down /></button>
                    <DeleteStep step={{ ...step, step_order: index + 1 }} />
                  </div>
                </div>
                {editing === step.id
                  ? <StepEditor step={{ ...step, step_order: index + 1 }} inputType={inputType} models={models} onDone={() => setEditing(null)} />
                  : <div className="preview">{step.instructions}</div>}
              </div>
            </li>
          );
        })}
      </ol>
      {order.length < maxSteps ? <AddStep chainId={chainId} position={order.length + 1} inputType={inputType} models={models} /> : <p className="muted small">This chain has the maximum of {maxSteps} steps.</p>}
    </div>
  );
}
