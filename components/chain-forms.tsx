'use client';
import { useActionState, useRef, useState } from 'react';
import { createChain, updateChain, deleteChain, type ActionState } from '@/app/actions';
import { TONES, type Chain } from '@/lib/types';

const INPUTS = [
  { value: 'image', title: 'An image', hint: 'Upload a picture each run' },
  { value: 'text', title: 'Text', hint: 'Type a topic or scene' },
  { value: 'none', title: 'Nothing', hint: 'Prompts are self-contained' },
];

function InputTypePicker({ value }: { value: string }) {
  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
      <span>The chain starts from</span>
      <div className="segmented">
        {INPUTS.map((o) => (
          <label key={o.value}><input type="radio" name="input_type" value={o.value} defaultChecked={value === o.value} /><b>{o.title}</b><small>{o.hint}</small></label>
        ))}
      </div>
    </fieldset>
  );
}

export function NewChainForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createChain, { error: '' });
  return (
    <form action={action} className="form card">
      <label className="field"><span>Name</span><input type="text" name="name" maxLength={120} placeholder="Meme caption factory" autoFocus /></label>
      <label className="field"><span>Description <small>(optional)</small></span><textarea name="description" maxLength={2000} placeholder="What this chain produces and when to use it." /></label>
      <InputTypePicker value="image" />
      <label className="check"><input type="checkbox" name="starter" defaultChecked /><span><b>Add the caption starter steps</b><br /><span className="muted small">Describe the image → find the joke → write five captions. You can edit, reorder or delete them afterwards.</span></span></label>
      <label className="field"><span>Or import an exported chain <small>(optional)</small></span><input type="file" name="import" accept="application/json,.json" /><small>Imported steps replace the starter. A blank name uses the imported one.</small></label>
      {state.error && <p className="notice error" role="alert">{state.error}</p>}
      <div className="row"><button className="btn primary" disabled={pending}>{pending ? 'Creating…' : 'Create chain'}</button></div>
    </form>
  );
}

export function ChainDetailsForm({ chain }: { chain: Chain }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateChain, { error: '' });
  return (
    <form action={action} className="form">
      <input type="hidden" name="id" value={chain.id} />
      <label className="field"><span>Name</span><input type="text" name="name" maxLength={120} defaultValue={chain.name} required /></label>
      <label className="field"><span>Description</span><textarea name="description" maxLength={2000} defaultValue={chain.description ?? ''} /></label>
      <InputTypePicker value={chain.input_type} />
      <div className="grid2">
        <label className="field"><span>Rating app tone</span>
          <select name="tone" defaultValue={chain.tone ?? ''}>
            <option value="">None</option>
            {TONES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <small>The rating app logs each caption against the chain linked to its tone. Each tone links to one chain.</small>
        </label>
        <label className="check" style={{ alignSelf: 'center' }}><input type="checkbox" name="is_active" defaultChecked={chain.is_active} /><span><b>Active</b><br /><span className="muted small">Inactive chains stay editable and runnable here but are marked retired in the admin panel.</span></span></label>
      </div>
      {state.error && <p className="notice error" role="alert">{state.error}</p>}
      {state.ok && <p className="notice ok" role="status">{state.ok}</p>}
      <div className="row"><button className="btn primary" disabled={pending}>{pending ? 'Saving…' : 'Save details'}</button></div>
    </form>
  );
}

export function DeleteChainButton({ chain, runCount, captionCount }: { chain: Chain; runCount: number; captionCount: number }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState('');
  const [state, action, pending] = useActionState<ActionState, FormData>(deleteChain, { error: '' });
  return (
    <>
      <button type="button" className="btn danger" onClick={() => dialog.current?.showModal()}>Delete chain</button>
      <dialog ref={dialog} aria-labelledby="delete-chain-title">
        <h2 id="delete-chain-title">Delete “{chain.name}”?</h2>
        <p className="muted">This permanently removes the chain, its steps, and {runCount} test run{runCount === 1 ? '' : 's'} with their generated images. It cannot be undone.</p>
        {(chain.tone || captionCount > 0) && <p className="notice info small">{chain.tone ? `This chain is linked to the rating app's ${chain.tone} tone. ` : ''}{captionCount > 0 ? `${captionCount} published caption${captionCount === 1 ? '' : 's'} stay in the archive but lose their link to this chain.` : ''}</p>}
        <form action={action} className="form">
          <input type="hidden" name="id" value={chain.id} />
          <input type="hidden" name="expected_name" value={chain.name} />
          <label className="field"><span>Type <b>{chain.name}</b> to confirm</span><input type="text" name="confirm_name" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></label>
          {state.error && <p className="notice error" role="alert">{state.error}</p>}
          <div className="row">
            <button type="button" className="btn" disabled={pending} onClick={() => dialog.current?.close()}>Cancel</button>
            <button className="btn danger" disabled={pending || typed !== chain.name}>{pending ? 'Deleting…' : 'Delete permanently'}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
