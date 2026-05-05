"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { SearchableSelect } from "@/components/searchable-select";
import { useRouter } from "next/navigation";
import type { FormActionResult } from "@/lib/forms/action-result";

type Approver = {
  id: string;
  name: string;
  email: string;
};

type EmployeePrefill = {
  employeeId: string;
  fullName: string;
  department: string;
  birthday: string;
  contactNumber: string;
  supervisorEmail: string;
  departmentHeadEmail: string;
};

export type TravelBookingFormProps = {
  user: { email: string; name: string };
  prefill: EmployeePrefill;
  initial?: TravelBookingInitialValues;
  submitAction: (formData: FormData) => Promise<FormActionResult>;
  submitLabel?: string;
  departments: string[];
  airports: string[];
  multiCityDepartures: string[];
  airlines: string[];
  baggageOptions: string[];
  supervisors: Approver[];
  heads: Approver[];
};

type TripType = "roundtrip" | "oneway" | "multicity";
const BRAND_LOGO_SRC = "/brand/vienovo-feed-for-life.png";

export type TravelBookingInitialValues = Partial<{
  landAir: "By Land" | "By Air" | "";
  tripType: TripType;
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  preferredTime: string;
  mc1Origin: string;
  mc1Destination: string;
  mc1Date: string;
  mc1Time: string;
  mc2Origin: string;
  mc2Destination: string;
  mc2Date: string;
  mc2Time: string;
  airline: string;
  travelPurpose: string;
  baggage: string;
  hotelAccommodation: "Yes" | "No" | "Other" | "";
  hotelOther: string;
  servicePickup: "Yes" | "No" | "";
}>;

export function TravelBookingForm(props: TravelBookingFormProps) {
  const router = useRouter();
  const {
    user,
    prefill,
    initial,
    submitAction,
    submitLabel,
    departments,
    airports,
    multiCityDepartures,
    airlines,
    baggageOptions,
    supervisors,
    heads,
  } = props;

  const initialSupervisorId = useMemo(() => {
    const email = (prefill.supervisorEmail || "").toLowerCase().trim();
    if (!email) return "";
    const match = supervisors.find((s) => s.email.toLowerCase() === email);
    return match?.id ?? "";
  }, [prefill.supervisorEmail, supervisors]);

  const initialHeadId = useMemo(() => {
    const email = (prefill.departmentHeadEmail || "").toLowerCase().trim();
    if (!email) return "";
    const match = heads.find((h) => h.email.toLowerCase() === email);
    return match?.id ?? "";
  }, [prefill.departmentHeadEmail, heads]);

  // Personal
  const [employeeId, setEmployeeId] = useState(prefill.employeeId || "");
  const [fullName, setFullName] = useState(prefill.fullName || user.name || "");
  const [department, setDepartment] = useState(prefill.department || "");
  const [birthday, setBirthday] = useState(prefill.birthday || "");
  const [contactNumber, setContactNumber] = useState(prefill.contactNumber || "");

  // Travel details
  const [landAir, setLandAir] = useState<"By Land" | "By Air" | "">(initial?.landAir ?? "");
  const [tripType, setTripType] = useState<TripType>(initial?.tripType ?? "roundtrip");
  const [origin, setOrigin] = useState(initial?.origin ?? "");
  const [destination, setDestination] = useState(initial?.destination ?? "");
  const [departureDate, setDepartureDate] = useState(initial?.departureDate ?? "");
  const [returnDate, setReturnDate] = useState(initial?.returnDate ?? "");
  const [preferredTime, setPreferredTime] = useState(initial?.preferredTime ?? "");

  // Multi-city
  const [mc1Origin, setMc1Origin] = useState(initial?.mc1Origin ?? "");
  const [mc1Destination, setMc1Destination] = useState(initial?.mc1Destination ?? "");
  const [mc1Date, setMc1Date] = useState(initial?.mc1Date ?? "");
  const [mc1Time, setMc1Time] = useState(initial?.mc1Time ?? "");
  const [mc2Origin, setMc2Origin] = useState(initial?.mc2Origin ?? "");
  const [mc2Destination, setMc2Destination] = useState(initial?.mc2Destination ?? "");
  const [mc2Date, setMc2Date] = useState(initial?.mc2Date ?? "");
  const [mc2Time, setMc2Time] = useState(initial?.mc2Time ?? "");

  // Flight
  const [airline, setAirline] = useState(initial?.airline ?? "");
  const [travelPurpose, setTravelPurpose] = useState(initial?.travelPurpose ?? "");
  const [baggage, setBaggage] = useState(initial?.baggage ?? "");

  // Accommodation
  const [hotelAccommodation, setHotelAccommodation] = useState<
    "Yes" | "No" | "Other" | ""
  >(initial?.hotelAccommodation ?? "");
  const [hotelOther, setHotelOther] = useState(initial?.hotelOther ?? "");
  const [servicePickup, setServicePickup] = useState<"Yes" | "No" | "">(
    initial?.servicePickup ?? ""
  );

  // Documents
  const [fileName, setFileName] = useState("");

  // Approvals
  const [supervisorId, setSupervisorId] = useState(initialSupervisorId);
  const [headId, setHeadId] = useState(initialHeadId);

  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const supervisorEmail = useMemo(
    () => supervisors.find((s) => s.id === supervisorId)?.email ?? "",
    [supervisors, supervisorId]
  );
  const headEmail = useMemo(
    () => heads.find((h) => h.id === headId)?.email ?? "",
    [heads, headId]
  );

  function validate(): string[] {
    const errs: string[] = [];
    if (!employeeId) errs.push("Employee ID");
    if (!fullName) errs.push("Full Name");
    if (!department) errs.push("Department");
    if (!birthday) errs.push("Birthday");
    if (!contactNumber) errs.push("Contact Number");
    if (!landAir) errs.push("Land / Air");
    if (tripType === "multicity") {
      if (!mc1Origin) errs.push("Trip 1 From");
      if (!mc1Destination) errs.push("Trip 1 To");
      if (!mc1Date) errs.push("Trip 1 Departing On");
      if (!mc1Time) errs.push("Trip 1 Preferred Time");
      if (!mc2Origin) errs.push("Trip 2 From");
      if (!mc2Destination) errs.push("Trip 2 To");
      if (!mc2Date) errs.push("Trip 2 Departing On");
      if (!mc2Time) errs.push("Trip 2 Preferred Time");
    } else {
      if (!origin) errs.push("Origin");
      if (!destination) errs.push("Destination");
      if (!departureDate) errs.push("Departure Date");
      if (tripType === "roundtrip" && !returnDate) errs.push("Return Date");
      if (!preferredTime) errs.push("Preferred Time");
    }
    if (!airline) errs.push("Airlines");
    if (!travelPurpose) errs.push("Travel Purpose");
    if (!baggage) errs.push("Baggage");
    if (!hotelAccommodation) errs.push("Hotel Accommodation");
    if (hotelAccommodation === "Other" && !hotelOther) errs.push("Hotel (Other) specify");
    if (!servicePickup) errs.push("Service / Pickup");
    if (!supervisorId) errs.push("Immediate Superior");
    if (!headId) errs.push("Department Head");
    return errs;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const errs = validate();
    if (errs.length) {
      setErrors(errs);
      setSubmitError(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setErrors([]);
    setSubmitError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(() => {
      void submitAction(fd).then((result) => {
        if (!result.ok) {
          setSubmitError(result.error);
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }

        router.push(result.redirectTo);
        router.refresh();
      });
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Title card */}
      <Card className="!p-0 overflow-hidden">
        <div
          className="flex items-center gap-3 px-4 sm:px-6 py-3 sm:py-5"
          style={{
            background:
              "linear-gradient(90deg,#16a34a 0%,#166534 50%,#14532d 100%)",
          }}
        >
          <div className="rounded-xl bg-white/90 px-2 py-1 ring-2 ring-white/30">
            <Image
              src={BRAND_LOGO_SRC}
              alt="Vienovo"
              width={140}
              height={28}
              priority
              className="h-7 w-auto"
            />
          </div>
          <div className="ml-auto text-right">
            <div className="text-base sm:text-lg font-bold text-white tracking-tight">
              Vienovo Travel Booking
            </div>
            <div className="text-green-200 text-[11px] sm:text-xs font-medium mt-0.5">
              Internal Travel Request Form
            </div>
          </div>
        </div>
        <div className="px-5 py-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-brand-400 to-brand-700"></div>
          <div className="pl-3">
            <h1 className="text-xl font-bold text-gray-800">Travel Booking Request</h1>
            <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
              Submit a new travel request. Your supervisor and department head
              will be notified for approval.
            </p>
            <p className="text-xs text-red-400 mt-2 font-medium">
              * Indicates required question
            </p>
          </div>
        </div>
      </Card>

      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800">
          <p className="font-semibold mb-1">Please complete:</p>
          <ul className="list-disc pl-5 text-xs space-y-0.5">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {submitError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800">
          <p className="font-semibold mb-1">Submission failed.</p>
          <p>{submitError}</p>
        </div>
      )}

      {/* Section: Personal Information */}
      <Card>
        <SectionTitle>Personal Information</SectionTitle>

        <Field label="Email" required>
          <input
            type="email"
            value={user.email}
            readOnly
            className="field-input field-locked"
          />
          <p className="text-xs text-gray-400 mt-1">
            Signed in as <strong>{user.email}</strong>
          </p>
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <Field label="Employee ID" required>
            <input
              type="text"
              name="employeeId"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              required
              className="field-input"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <Field label="Full Name" required>
            <input
              type="text"
              name="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="field-input"
            />
          </Field>

          <Field label="Department" required>
            <SearchableSelect name="department" value={department} onChange={setDepartment} required placeholder="-- Select Department --" options={departments.map((d) => ({ value: d, label: d }))} />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <Field label="Birthday" required>
            <input
              type="date"
              name="birthday"
              value={birthday}
              onChange={(e) => setBirthday(e.target.value)}
              required
              className="field-input"
            />
          </Field>

          <Field label="Contact Number" required>
            <input
              type="tel"
              name="contactNumber"
              value={contactNumber}
              onChange={(e) => setContactNumber(e.target.value)}
              required
              className="field-input"
            />
          </Field>
        </div>
      </Card>

      {/* Section: Travel Details */}
      <Card>
        <SectionTitle>Travel Details</SectionTitle>

        <Field label="Land / Air" required>
          <input type="hidden" name="landAir" value={landAir} />
          <div className="flex gap-3">
            {(["By Land", "By Air"] as const).map((opt) => (
              <RadioCard
                key={opt}
                label={opt}
                checked={landAir === opt}
                onChange={() => setLandAir(opt)}
              />
            ))}
          </div>
        </Field>

        <Field label="Trip Type" required className="mt-4">
          <input type="hidden" name="tripType" value={tripType} />
          <div className="flex flex-col sm:flex-row gap-2">
            <TripButton
              active={tripType === "roundtrip"}
              onClick={() => setTripType("roundtrip")}
            >
              ⇄ Round-trip
            </TripButton>
            <TripButton
              active={tripType === "oneway"}
              onClick={() => setTripType("oneway")}
            >
              → One-way
            </TripButton>
            <TripButton
              active={tripType === "multicity"}
              onClick={() => setTripType("multicity")}
            >
              ⊕ Multi-city
            </TripButton>
          </div>
        </Field>

        {tripType !== "multicity" ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <Field label="From (Origin)" required>
                <SearchableSelect name="origin" value={origin} onChange={setOrigin} required placeholder="-- Select Origin --" options={airports.map((a) => ({ value: a, label: a }))} />
              </Field>
              <Field label="To (Destination)" required>
                <SearchableSelect name="destination" value={destination} onChange={setDestination} required placeholder="-- Select Destination --" options={airports.map((a) => ({ value: a, label: a }))} />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <Field label="Departure Date" required>
                <input
                  type="date"
                  name="departureDate"
                  value={departureDate}
                  onChange={(e) => setDepartureDate(e.target.value)}
                  required
                  className="field-input"
                />
              </Field>
              {tripType === "roundtrip" && (
                <Field label="Return Date" required>
                  <input
                    type="date"
                    name="returnDate"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    required
                    className="field-input"
                  />
                </Field>
              )}
            </div>

            <Field label="Preferred Time" required className="mt-4">
              <input
                type="time"
                name="preferredTime"
                value={preferredTime}
                onChange={(e) => setPreferredTime(e.target.value)}
                required
                className="field-input"
              />
            </Field>
          </>
        ) : (
          <div className="mt-4 space-y-4">
            <MultiCityLeg
              label="Trip 1"
              originName="mc1Origin"
              destinationName="mc1Destination"
              dateName="mc1Date"
              timeName="mc1Time"
              origins={multiCityDepartures}
              destinations={airports}
              origin={mc1Origin}
              setOrigin={setMc1Origin}
              destination={mc1Destination}
              setDestination={setMc1Destination}
              date={mc1Date}
              setDate={setMc1Date}
              time={mc1Time}
              setTime={setMc1Time}
            />
            <MultiCityLeg
              label="Trip 2"
              originName="mc2Origin"
              destinationName="mc2Destination"
              dateName="mc2Date"
              timeName="mc2Time"
              origins={multiCityDepartures}
              destinations={airports}
              origin={mc2Origin}
              setOrigin={setMc2Origin}
              destination={mc2Destination}
              setDestination={setMc2Destination}
              date={mc2Date}
              setDate={setMc2Date}
              time={mc2Time}
              setTime={setMc2Time}
            />
          </div>
        )}
      </Card>

      {/* Section: Flight & Baggage */}
      <Card>
        <SectionTitle>Flight &amp; Baggage</SectionTitle>

        <Field label="Airlines" required>
          <SearchableSelect name="airline" value={airline} onChange={setAirline} required placeholder="-- Select Airlines --" options={airlines.map((a) => ({ value: a, label: a }))} />
        </Field>

        <Field label="Travel Purpose" required className="mt-4">
          <textarea
            name="travelPurpose"
            value={travelPurpose}
            onChange={(e) => setTravelPurpose(e.target.value)}
            required
            rows={3}
            placeholder="Describe the purpose of your travel…"
            className="field-input resize-none"
          />
        </Field>

        <Field label="Baggage (Kg)" required className="mt-4">
          <SearchableSelect name="baggage" value={baggage} onChange={setBaggage} required placeholder="-- Select --" options={baggageOptions.map((b) => ({ value: b, label: b }))} />
        </Field>
      </Card>

      {/* Section: Accommodation */}
      <Card>
        <SectionTitle>Accommodation &amp; Service</SectionTitle>

        <Field label="Hotel Accommodation" required>
          <input type="hidden" name="hotelAccommodation" value={hotelAccommodation} />
          <input type="hidden" name="hotelOther" value={hotelOther} />
          <div className="flex flex-col gap-2">
            <RadioCard
              label="Yes"
              checked={hotelAccommodation === "Yes"}
              onChange={() => setHotelAccommodation("Yes")}
            />
            <RadioCard
              label="No"
              checked={hotelAccommodation === "No"}
              onChange={() => setHotelAccommodation("No")}
            />
            <label
              className={`radio-card gap-2 ${
                hotelAccommodation === "Other"
                  ? "radio-card-checked"
                  : ""
              }`}
              onClick={() => setHotelAccommodation("Other")}
            >
              <input
                type="radio"
                name="hotelChoice"
                checked={hotelAccommodation === "Other"}
                onChange={() => setHotelAccommodation("Other")}
              />
              <span>Other:</span>
              <input
                type="text"
                disabled={hotelAccommodation !== "Other"}
                value={hotelOther}
                onChange={(e) => setHotelOther(e.target.value)}
                placeholder="please specify"
                className="flex-1 border-0 border-b border-gray-300 focus:outline-none focus:border-brand-600 text-sm bg-transparent disabled:opacity-40"
              />
            </label>
          </div>
        </Field>

        <Field label="Service / Pickup" required className="mt-5">
          <input type="hidden" name="servicePickup" value={servicePickup} />
          <div className="flex gap-3">
            {(["Yes", "No"] as const).map((opt) => (
              <RadioCard
                key={opt}
                label={opt}
                checked={servicePickup === opt}
                onChange={() => setServicePickup(opt)}
              />
            ))}
          </div>
        </Field>
      </Card>

      {/* Section: Documents */}
      <Card>
        <SectionTitle>Supporting Documents</SectionTitle>
        <p className="text-sm font-semibold text-gray-700">Activity Schedule</p>
        <p className="text-xs text-gray-400 mb-3">
          Optional. PDF, DOC, XLS, PNG, JPG — max 10 MB.
        </p>
        <input type="hidden" name="activityScheduleFileName" value={fileName} />
        <label
          htmlFor="activityFile"
          className="block border-2 border-dashed border-brand-200 rounded-2xl p-6 text-center cursor-pointer hover:border-brand-500 hover:bg-brand-50 transition-all bg-brand-50/30"
        >
          <input
            id="activityFile"
            type="file"
            className="hidden"
            name="activitySchedule"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
          />
          <div className="w-12 h-12 rounded-full bg-brand-100 flex items-center justify-center mx-auto mb-3">
            <svg
              className="w-6 h-6 text-brand-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
              />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-500">
            Click to upload or drag and drop
          </p>
          <p className="text-xs text-gray-400 mt-1">
            PDF, DOC, XLS, PNG, JPG — max 10 MB
          </p>
          {fileName && (
            <p className="text-sm font-semibold text-brand-700 mt-2">{fileName}</p>
          )}
        </label>
        <p className="text-[11px] text-gray-500 mt-2 italic">
          File will be uploaded to Drive on submit.
        </p>
      </Card>

      {/* Section: Approvals + Submit */}
      <Card>
        <SectionTitle>Approvals</SectionTitle>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Immediate Superior" required>
            <SearchableSelect name="supervisorId" value={supervisorId} onChange={setSupervisorId} required placeholder="-- Select --" options={supervisors.map((s) => ({ value: s.id, label: s.name }))} />
          </Field>
          <Field label="Immediate Superior Email">
            <input
              type="email"
              value={supervisorEmail}
              readOnly
              placeholder="Auto-filled on selection"
              className="field-input field-locked"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <Field label="Department Head" required>
            <SearchableSelect name="headId" value={headId} onChange={setHeadId} required placeholder="-- Select --" options={heads.map((h) => ({ value: h.id, label: h.name }))} />
          </Field>
          <Field label="Department Head Email">
            <input
              type="email"
              value={headEmail}
              readOnly
              placeholder="Auto-filled on selection"
              className="field-input field-locked"
            />
          </Field>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end items-center gap-3 pt-6">
          <button
            type="submit"
            disabled={pending}
            className="bg-gradient-to-br from-brand-600 to-brand-700 text-white font-semibold px-8 py-2.5 rounded-lg shadow-md hover:opacity-95 active:scale-[0.99] transition disabled:opacity-50 w-full sm:w-auto"
          >
            {pending ? "Submitting..." : (submitLabel ?? "Submit Request")}
          </button>
        </div>
      </Card>
    </form>
  );
}

/* ─── Sub-components ──────────────────────────────────────────────────── */

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-white rounded-2xl shadow-sm border border-brand-100 px-4 sm:px-6 py-5 ${className}`}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold tracking-[0.1em] uppercase text-brand-700 border-l-[3px] border-brand-600 pl-3 mb-5">
      {children}
    </p>
  );
}

function Field({
  label,
  required,
  className = "",
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">
        {label}
        {required && <span className="text-red-400"> *</span>}
      </label>
      {children}
    </div>
  );
}

function RadioCard({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={`radio-card flex-1 ${checked ? "radio-card-checked" : ""}`}
      onClick={onChange}
    >
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className="accent-brand-700"
      />
      <span>{label}</span>
    </label>
  );
}

function TripButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-2.5 px-2 rounded-xl border-2 text-sm font-semibold transition-all ${
        active
          ? "border-brand-600 bg-brand-600 text-white"
          : "border-gray-200 bg-white text-gray-600 hover:border-brand-400"
      }`}
    >
      {children}
    </button>
  );
}

function MultiCityLeg(props: {
  label: string;
  originName: string;
  destinationName: string;
  dateName: string;
  timeName: string;
  origins: string[];
  destinations: string[];
  origin: string;
  setOrigin: (v: string) => void;
  destination: string;
  setDestination: (v: string) => void;
  date: string;
  setDate: (v: string) => void;
  time: string;
  setTime: (v: string) => void;
}) {
  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
      <p className="text-[11px] font-bold text-brand-700 uppercase tracking-widest mb-3">
        {props.label}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <Field label="From" required>
          <SearchableSelect name={props.originName} value={props.origin} onChange={props.setOrigin} required placeholder="-- Select --" options={props.origins.map((a) => ({ value: a, label: a }))} />
        </Field>
        <Field label="To" required>
          <SearchableSelect name={props.destinationName} value={props.destination} onChange={props.setDestination} required placeholder="-- Select --" options={props.destinations.map((a) => ({ value: a, label: a }))} />
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Departing On" required>
          <input
            type="date"
            name={props.dateName}
            value={props.date}
            onChange={(e) => props.setDate(e.target.value)}
            required
            className="field-input"
          />
        </Field>
        <Field label="Preferred Time" required>
          <input
            type="time"
            name={props.timeName}
            value={props.time}
            onChange={(e) => props.setTime(e.target.value)}
            required
            className="field-input"
          />
        </Field>
      </div>
    </div>
  );
}

