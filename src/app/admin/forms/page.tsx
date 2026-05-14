import { connectMongo } from "@/lib/db/mongo";
import { getAllFormDefinitionsForAdmin } from "@/lib/form-definitions";
import {
  FORM_DEFINITION_AVAILABILITIES,
  FORM_DEFINITION_STATUSES,
  FORM_DEFINITION_VISIBILITIES,
} from "@/models/FormDefinition";
import { Approver } from "@/models/Approver";
import { FormImport } from "@/models/FormImport";
import { FormsRegistryClient } from "./FormsRegistryClient";

export default async function AdminFormsPage() {
  const forms = await getAllFormDefinitionsForAdmin();
  await connectMongo();
  const [imports, processors, approvers] = await Promise.all([
    FormImport.find({}).select({ slug: 1 }).lean(),
    Approver.find({ roles: "processor" })
      .sort({ isActive: -1, name: 1 })
      .select({ _id: 1, name: 1, email: 1, isActive: 1 })
      .lean(),
    Approver.find({ isActive: true, email: { $ne: "" } })
      .sort({ name: 1 })
      .select({ _id: 1, name: 1, email: 1 })
      .lean(),
  ]);

  const liveCount = forms.filter(isLiveForRequesters).length;
  const publishedCount = forms.filter((form) => form.status === "published").length;
  const draftCount = forms.filter((form) => form.status === "draft").length;
  const importedCount = forms.filter((form) => form.source === "imported").length;
  const hasOnlyBuiltIns = importedCount === 0 && forms.every((form) => form.source === "native");

  return (
    <FormsRegistryClient
      forms={forms}
      importedSlugSet={imports.map((item) => item.slug)}
      liveCount={liveCount}
      publishedCount={publishedCount}
      draftCount={draftCount}
      importedCount={importedCount}
      hasOnlyBuiltIns={hasOnlyBuiltIns}
      statusOptions={[...FORM_DEFINITION_STATUSES]}
      visibilityOptions={[...FORM_DEFINITION_VISIBILITIES]}
      availabilityOptions={[...FORM_DEFINITION_AVAILABILITIES]}
      approvalApproverOptions={approvers.map((item) => ({
        _id: String(item._id),
        name: item.name,
        email: item.email,
      }))}
      processorOptions={processors.map((item) => ({
        _id: String(item._id),
        name: item.name,
        email: item.email,
        isActive: Boolean(item.isActive),
      }))}
    />
  );
}

function isLiveForRequesters(form: {
  runtime: { requesterCanOpen: boolean };
}) {
  return form.runtime.requesterCanOpen;
}
