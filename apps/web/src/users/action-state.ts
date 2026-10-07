// Result of an admin panel Server Function, rendered next to the form.
export interface ActionState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
}

export const IDLE: ActionState = { status: "idle" };
