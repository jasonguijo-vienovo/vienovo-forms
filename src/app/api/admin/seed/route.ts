import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/db/mongo";
import { Lookup, type LookupCategory } from "@/models/Lookup";
import { Approver } from "@/models/Approver";
import { ReimbursementRoute } from "@/models/ReimbursementRoute";
import { requireAdmin } from "@/lib/admin";
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

export const maxDuration = 60;

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

  const [
    departments,
    airports,
    multiCityDeparture,
    airlines,
    baggage,
    reimbursementCostCenter,
    reimbursementFormType,
    reimbursementLocation,
  ] = await Promise.all([
    seedCategory("department", SEED_DEPARTMENTS),
    seedCategory("airport", SEED_AIRPORTS),
    seedCategory("multiCityDeparture", SEED_DOMESTIC_AIRPORTS),
    seedCategory("airline", SEED_AIRLINES),
    seedCategory("baggage", SEED_BAGGAGE),
    seedCategory("reimbursementCostCenter", SEED_REIMBURSEMENT_COST_CENTERS),
    seedCategory("reimbursementFormType", SEED_REIMBURSEMENT_FORM_TYPES),
    seedCategory("reimbursementLocation", SEED_REIMBURSEMENT_LOCATIONS),
  ]);

  const result = {
    departments,
    airports,
    multiCityDeparture,
    airlines,
    baggage,
    reimbursementCostCenter,
    reimbursementFormType,
    reimbursementLocation,
    reimbursementRoutes: 0,
    reimbursementRoutesUpdated: 0,
    approvers: 0,
    approverRolesUpdated: 0,
    importedSyncDeferred: 1,
  };

  const routeResult = await seedReimbursementRoutes();
  result.reimbursementRoutes = routeResult.added;
  result.reimbursementRoutesUpdated = routeResult.updated;

  const approverResult = await seedApprovers();
  result.approvers = approverResult.added;
  result.approverRolesUpdated = approverResult.rolesAdded;

  return NextResponse.json({ ok: true, added: result });
}
