import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/db/mongo";
import { Lookup, type LookupCategory } from "@/models/Lookup";
import { Approver } from "@/models/Approver";
import { ReimbursementRoute } from "@/models/ReimbursementRoute";
import { requireAdmin } from "@/lib/admin";
import { syncImportedLookupsForAllImports } from "@/lib/imported-lookups";
import {
  SEED_DEPARTMENTS,
  SEED_AIRPORTS,
  SEED_DOMESTIC_AIRPORTS,
  SEED_AIRLINES,
  SEED_BAGGAGE,
  SEED_REIMBURSEMENT_COST_CENTERS,
  SEED_REIMBURSEMENT_FORM_TYPES,
  SEED_REIMBURSEMENT_LOCATIONS,
  SEED_REIMBURSEMENT_ROUTES,
  SEED_APPROVERS,
} from "@/lib/seed-data";

async function seedCategory(category: LookupCategory, values: string[]) {
  let added = 0;
  for (let i = 0; i < values.length; i++) {
    const result = await Lookup.updateOne(
      { category, value: values[i] },
      {
        $setOnInsert: {
          category,
          value: values[i],
          sortOrder: i,
          isActive: true,
        },
      },
      { upsert: true }
    );
    if (result.upsertedCount > 0) added++;
  }
  return added;
}

async function seedApprovers() {
  let added = 0;
  let rolesAdded = 0;
  for (const a of SEED_APPROVERS) {
    const result = await Approver.updateOne(
      { name: a.name },
      {
        $setOnInsert: {
          name: a.name,
          email: a.email,
          emailNeedsReview: a.emailNeedsReview,
          isActive: true,
        },
        $addToSet: { roles: { $each: a.roles } },
      },
      { upsert: true }
    );
    if (result.upsertedCount > 0) added++;
    else if (result.modifiedCount > 0) rolesAdded++;
  }
  return { added, rolesAdded };
}

async function seedReimbursementRoutes() {
  let added = 0;
  let updated = 0;
  for (let i = 0; i < SEED_REIMBURSEMENT_ROUTES.length; i++) {
    const r = SEED_REIMBURSEMENT_ROUTES[i];
    const res = await ReimbursementRoute.updateOne(
      { department: r.department, costCenter: r.costCenter, location: r.location },
      {
        $setOnInsert: {
          department: r.department,
          costCenter: r.costCenter,
          location: r.location,
          sortOrder: i,
          isActive: true,
        },
        $set: {
          supervisorEmail: r.supervisorEmail,
          supervisorName: r.supervisorName,
          headEmail: r.headEmail,
          headName: r.headName,
        },
      },
      { upsert: true }
    );
    if (res.upsertedCount > 0) added++;
    else if (res.modifiedCount > 0) updated++;
  }
  return { added, updated };
}

export async function POST() {
  await requireAdmin();
  await connectMongo();

  const result = {
    departments: await seedCategory("department", SEED_DEPARTMENTS),
    airports: await seedCategory("airport", SEED_AIRPORTS),
    multiCityDeparture: await seedCategory(
      "multiCityDeparture",
      SEED_DOMESTIC_AIRPORTS
    ),
    airlines: await seedCategory("airline", SEED_AIRLINES),
    baggage: await seedCategory("baggage", SEED_BAGGAGE),
    reimbursementCostCenter: await seedCategory(
      "reimbursementCostCenter",
      SEED_REIMBURSEMENT_COST_CENTERS
    ),
    reimbursementFormType: await seedCategory(
      "reimbursementFormType",
      SEED_REIMBURSEMENT_FORM_TYPES
    ),
    reimbursementLocation: await seedCategory(
      "reimbursementLocation",
      SEED_REIMBURSEMENT_LOCATIONS
    ),
    reimbursementRoutes: 0,
    reimbursementRoutesUpdated: 0,
    approvers: 0,
    approverRolesUpdated: 0,
    importedDropdownImports: 0,
    importedDropdownCategories: 0,
    importedDropdownValues: 0,
    importedPeople: 0,
    importedProcessors: 0,
  };

  const routeResult = await seedReimbursementRoutes();
  result.reimbursementRoutes = routeResult.added;
  result.reimbursementRoutesUpdated = routeResult.updated;

  const approverResult = await seedApprovers();
  result.approvers = approverResult.added;
  result.approverRolesUpdated = approverResult.rolesAdded;

  const importedLookupResult = await syncImportedLookupsForAllImports();
  result.importedDropdownImports = importedLookupResult.importsSynced;
  result.importedDropdownCategories = importedLookupResult.categoriesSynced;
  result.importedDropdownValues = importedLookupResult.valuesSynced;
  result.importedPeople = importedLookupResult.peopleSynced;
  result.importedProcessors = importedLookupResult.processorsSynced;

  return NextResponse.json({ ok: true, added: result });
}
