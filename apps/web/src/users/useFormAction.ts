"use client";

import { type FormEvent, startTransition, useActionState } from "react";
import { type ActionState, IDLE } from "./action-state.ts";

// useActionState wired through onSubmit instead of <form action>: React resets
// a form after its action runs, which would wipe what the admin typed when the
// server answers with a validation error.
export function useFormAction(
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>,
) {
  const [state, dispatch, pending] = useActionState(action, IDLE);
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  }
  return { state, pending, onSubmit };
}
