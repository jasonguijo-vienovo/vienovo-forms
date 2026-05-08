type FormRuntimeInput = {
  slug: string;
  status: "draft" | "published" | "archived";
  visibility: "everyone" | "admin";
  availability: "available" | "coming-soon";
  isImplemented: boolean;
  externalFormUrl?: string;
  showInNavbar: boolean;
};

export type FormRuntimeState = {
  state: "live" | "admin-only" | "draft" | "coming-soon" | "archived";
  isLive: boolean;
  isPublishedToRequesters: boolean;
  requesterCanOpen: boolean;
  shouldShowInNavbar: boolean;
  blockerMessage: string | null;
};

export function projectFormRuntimeState(form: FormRuntimeInput): FormRuntimeState {
  const hasLaunchTarget = form.isImplemented || Boolean(String(form.externalFormUrl ?? "").trim());
  const isLive = form.status === "published" && form.availability === "available" && hasLaunchTarget;

  let state: FormRuntimeState["state"] = "live";
  if (form.status === "archived") {
    state = "archived";
  } else if (form.status !== "published") {
    state = "draft";
  } else if (form.availability !== "available" || !hasLaunchTarget) {
    state = "coming-soon";
  } else if (form.visibility === "admin") {
    state = "admin-only";
  }

  const requesterCanOpen = isLive && form.visibility === "everyone";
  const blockerMessage =
    state === "archived"
      ? "This form has been archived."
      : state === "draft"
        ? "This form is not published yet."
        : state === "coming-soon"
          ? "This form is not available yet."
          : state === "admin-only"
            ? "This form is only available to admins."
            : null;

  return {
    state,
    isLive,
    isPublishedToRequesters: requesterCanOpen,
    requesterCanOpen,
    shouldShowInNavbar: requesterCanOpen && form.showInNavbar,
    blockerMessage,
  };
}

export function getFormUserAccess(
  form: FormRuntimeInput,
  opts?: {
    isAdmin?: boolean;
    requesterPreview?: boolean;
  },
) {
  const runtime = projectFormRuntimeState(form);
  const isAdmin = opts?.isAdmin ?? false;
  const requesterPreview = opts?.requesterPreview ?? false;
  const actAsRequester = requesterPreview || !isAdmin;

  const adminCanSubmit = runtime.isLive && (form.visibility === "everyone" || isAdmin);
  const canOpen = actAsRequester ? runtime.requesterCanOpen : true;
  const canSubmit = actAsRequester ? runtime.requesterCanOpen : adminCanSubmit;

  return {
    runtime,
    canOpen,
    canSubmit,
    blockerMessage:
      canOpen && canSubmit
        ? null
        : runtime.blockerMessage ??
          (form.visibility === "admin" && !isAdmin
            ? "This form is not available to you."
            : "This form is not available right now."),
  };
}
