import { connectMongo } from "@/lib/db/mongo";
import { getAllFormDefinitionsForAdmin } from "@/lib/form-definitions";
import { FormImport } from "@/models/FormImport";
import { FormsRegistryClient } from "./FormsRegistryClient";

export default async function AdminFormsPage() {
  const forms = await getAllFormDefinitionsForAdmin();
  await connectMongo();
  const imports = await FormImport.find({}).select({ slug: 1 }).lean();

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
    />
  );
}

function isLiveForRequesters(form: {
  status: string;
  visibility: string;
  availability: string;
  isImplemented: boolean;
}) {
  return (
    form.status === "published" &&
    form.visibility === "everyone" &&
    form.availability === "available" &&
    form.isImplemented
  );
}
