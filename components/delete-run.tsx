'use client';
import { useActionState, useRef } from 'react';
import { deleteRun, type ActionState } from '@/app/actions';

export function DeleteRunButton({ id }: { id: number }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState<ActionState, FormData>(deleteRun, { error: '' });
  return (
    <>
      <button type="button" className="btn danger" onClick={() => dialog.current?.showModal()}>Delete run</button>
      <dialog ref={dialog} aria-labelledby="del-run">
        <h2 id="del-run">Delete run #{id}?</h2>
        <p className="muted">This permanently removes the run record and its stored images. The chain itself is not affected.</p>
        <form action={action}>
          <input type="hidden" name="id" value={id} />
          {state.error && <p className="notice error" role="alert">{state.error}</p>}
          <div className="row">
            <button type="button" className="btn" onClick={() => dialog.current?.close()}>Cancel</button>
            <button className="btn danger" disabled={pending}>{pending ? 'Deleting…' : 'Delete permanently'}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
