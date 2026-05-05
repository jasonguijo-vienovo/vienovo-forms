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

export const maxDuration = 60;

async function seedCategory(category: LookupCategory, values: string[]) {
  if (values.length === 0) {
    return 0;
  }

  const result = await Lookup.bulkWrite(
    values.map((value, index) => ({
      updateOne: {
        filter: { category, value },
        update: {
          $setOnInsert: {
            category,
            value,
            sortOrder: index,
            isActive: true,
          },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );

  return result.upsertedCount ?? 0;
}

async function seedApprovers() {
  if (SEED_APPROVERS.length === 0) {
    return { added: 0, rolesAdded: 0 };
  }

  const result = await Approver.bulkWrite(
    SEED_APPROVERS.map((approver) => ({
      updateOne: {
        filter: { name: approver.name },
        update: {
          $setOnInsert: {
            name: approver.name,
            email: approver.email,
            emailNeedsReview: approver.emailNeedsReview,
            isActive: true,
          },
          $addToSet: { roles: { $each: approver.roles } },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );

  return {
    added: result.upsertedCount ?? 0,
    rolesAdded: result.modifiedCount ?? 0,
  };
}

async function seedReimbursementRoutes() {
  if (SEED_REIMBURSEMENT_ROUTES.length === 0) {
    return { added: 0, updated: 0 };
  }

  const result = await ReimbursementRoute.bulkWrite(
    SEED_REIMBURSEMENT_ROUTES.map((route, index) => ({
      updateOne: {
        filter: {
          department: route.department,
          costCenter: route.costCenter,
          location: route.location,
        },
        update: {
          $setOnInsert: {
            department: route.department,
            costCenter: route.costCenter,
            location: route.location,
            sortOrder: index,
            isActive: true,
          },
          $set: {
            supervisorEmail: route.supervisorEmail,
            supervisorName: route.supervisorName,
            headEmail: route.headEmail,
            headName: route.headName,
          },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );

  return {
    added: result.upsertedCount ?? 0,
    updated: result.modifiedCount ?? 0,
  };
}

export async function POST() {
  try {
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
      routeResult,
      approverResult,
      importedLookupResult,
    ] = await Promise.all([
      seedCategory("department", SEED_DEPARTMENTS),
      seedCategory("airport", SEED_AIRPORTS),
      seedCategory("multiCityDeparture", SEED_DOMESTIC_AIRPORTS),
      seedCategory("airline", SEED_AIRLINES),
      seedCategory("baggage", SEED_BAGGAGE),
      seedCategory(
        "reimbursementCostCenter",
        SEED_REIMBURSEMENT_COST_CENTERS,
      ),
      seedCategory(
        "reimbursementFormType",
        SEED_REIMBURSEMENT_FORM_TYPES,
      ),
      seedCategory(
        "reimbursementLocation",
        SEED_REIMBURSEMENT_LOCATIONS,
      ),
      seedReimbursementRoutes(),
      seedApprovers(),
      syncImportedLookupsForAllImports(),
    ]);

    return NextResponse.json({
      ok: true,
      added: {
        departments,
        airports,
        multiCityDeparture,
        airlines,
        baggage,
        reimbursementCostCenter,
        reimbursementFormType,
        reimbursementLocation,
        reimbursementRoutes: routeResult.added,
        reimbursementRoutesUpdated: routeResult.updated,
        approvers: approverResult.added,
        approverRolesUpdated: approverResult.rolesAdded,
        importedDropdownImports: importedLookupResult.importsSynced,
        importedDropdownCategories: importedLookupResult.categoriesSynced,
        importedDropdownValues: importedLookupResult.valuesSynced,
        importedPeople: importedLookupResult.peopleSynced,
        importedProcessors: importedLookupResult.processorsSynced,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to seed admin data.";

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
