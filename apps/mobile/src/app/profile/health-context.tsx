import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { HealthContext, HealthContextInput, OrganFlag } from "@pharmabro/shared";
import { deleteHealthContext, fetchHealthContext, saveHealthContext } from "@/api/healthContext";
import { useAuth } from "@/auth/AuthProvider";
import { ErrorState, GuestState, LoadingState } from "@/components/states";
import { Card } from "@/components/ui";
import { HEALTH_CONTEXT_CONSENT } from "@/lib/legal";
import { common } from "@/theme/common";

// My Health Context (doc-06 Profile · doc-18 consent-gated). A REAL owner-scoped write
// path (user_health_context) — read / edit / independent delete. The consent toggle is
// the doc-18 "consent screen for optional health context"; saving records the consent
// version. Delete here removes ONLY this data (distinct from deleting the account).

const ORGAN_OPTIONS: OrganFlag[] = ["yes", "no", "unknown"];
const csv = (xs: string[]) => xs.join(", ");
const parseCsv = (s: string): string[] => s.split(",").map((x) => x.trim()).filter(Boolean);

function emptyForm(): HealthContextInput {
  return {
    age_range: null, sex: null, pregnancy_status: null,
    allergies: [], medications: [], supplements: [], conditions: [],
    kidney_disease_flag: null, liver_disease_flag: null, goals: [],
  };
}

function toForm(hc: HealthContext | null): HealthContextInput {
  if (!hc) return emptyForm();
  const { consent_version: _c, updated_at: _u, ...input } = hc;
  return input;
}

export default function HealthContextScreen() {
  const { session, loading: authLoading } = useAuth();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["health-context"], queryFn: fetchHealthContext, enabled: !!session });
  const [form, setForm] = useState<HealthContextInput>(emptyForm());
  const [consented, setConsented] = useState(false);

  // Seed the editable form once the saved row loads; an existing row implies prior consent.
  useEffect(() => {
    if (query.data !== undefined) {
      setForm(toForm(query.data));
      if (query.data) setConsented(true);
    }
  }, [query.data]);

  const save = useMutation({
    mutationFn: () => saveHealthContext(form),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["health-context"] }),
  });
  const remove = useMutation({
    mutationFn: () => deleteHealthContext(),
    onSuccess: () => {
      setForm(emptyForm());
      setConsented(false);
      qc.invalidateQueries({ queryKey: ["health-context"] });
    },
  });

  if (authLoading) return <LoadingState testID="hc-auth-loading" />;
  if (!session) {
    return (
      <View style={common.screen} testID="hc-guest">
        <GuestState body="Sign in to manage your health context.">
          <Pressable testID="goto-signin" style={common.linkBtn} onPress={() => router.push("/sign-in")}>
            <Text style={common.link}>Sign in</Text>
          </Pressable>
        </GuestState>
      </View>
    );
  }
  if (query.isLoading) return <LoadingState testID="hc-loading" />;
  if (query.isError) return <ErrorState testID="hc-error" body={(query.error as Error).message} />;

  const set = <K extends keyof HealthContextInput>(k: K, v: HealthContextInput[K]) => {
    if (save.isSuccess) save.reset(); // a fresh edit clears the stale "Saved." note
    setForm((f) => ({ ...f, [k]: v }));
  };
  const hasSaved = !!query.data;

  return (
    <ScrollView contentContainerStyle={styles.body} testID="hc-screen" keyboardShouldPersistTaps="handled">
      <Text style={common.h1}>My Health Context</Text>
      <Card testID="hc-consent-copy">
        <Text style={styles.consent}>{HEALTH_CONTEXT_CONSENT}</Text>
      </Card>

      <Field label="Age range" value={form.age_range ?? ""} onChange={(v) => set("age_range", v || null)} placeholder="e.g. 30-39" testID="hc-age" />
      <Field label="Sex" value={form.sex ?? ""} onChange={(v) => set("sex", v || null)} placeholder="e.g. female" testID="hc-sex" />
      <Field label="Pregnancy status" value={form.pregnancy_status ?? ""} onChange={(v) => set("pregnancy_status", v || null)} placeholder="e.g. not pregnant" testID="hc-pregnancy" />
      <Field label="Allergies (comma-separated)" value={csv(form.allergies)} onChange={(v) => set("allergies", parseCsv(v))} placeholder="e.g. penicillin, sulfa" testID="hc-allergies" />
      <Field label="Medications (comma-separated)" value={csv(form.medications)} onChange={(v) => set("medications", parseCsv(v))} placeholder="e.g. metformin" testID="hc-medications" />
      <Field label="Supplements (comma-separated)" value={csv(form.supplements)} onChange={(v) => set("supplements", parseCsv(v))} placeholder="e.g. vitamin D" testID="hc-supplements" />
      <Field label="Conditions (comma-separated)" value={csv(form.conditions)} onChange={(v) => set("conditions", parseCsv(v))} placeholder="e.g. hypertension" testID="hc-conditions" />
      <Field label="Goals (comma-separated)" value={csv(form.goals)} onChange={(v) => set("goals", parseCsv(v))} placeholder="e.g. lower blood pressure" testID="hc-goals" />

      <Segmented label="Kidney disease" value={form.kidney_disease_flag} onChange={(v) => set("kidney_disease_flag", v)} testID="hc-kidney" />
      <Segmented label="Liver disease" value={form.liver_disease_flag} onChange={(v) => set("liver_disease_flag", v)} testID="hc-liver" />

      {!hasSaved ? (
        <Pressable testID="hc-consent" style={styles.consentRow} onPress={() => setConsented((c) => !c)}>
          <View style={[styles.checkbox, consented && styles.checkboxOn]}>{consented ? <Text style={styles.check}>✓</Text> : null}</View>
          <Text style={styles.consentLabel}>I understand this is optional and educational, and I consent to storing it.</Text>
        </Pressable>
      ) : null}

      {save.isError ? <ErrorState testID="hc-save-error" body={(save.error as Error).message} /> : null}
      {save.isSuccess ? <Text style={styles.saved} testID="hc-saved">Saved.</Text> : null}

      <Pressable
        testID="hc-save"
        style={[common.btn, (!consented || save.isPending) && styles.disabled]}
        disabled={!consented || save.isPending}
        onPress={() => save.mutate()}
      >
        <Text style={common.btnText}>{save.isPending ? "Saving…" : "Save"}</Text>
      </Pressable>

      {remove.isError ? <ErrorState testID="hc-delete-error" body={(remove.error as Error).message} /> : null}
      {hasSaved ? (
        <Pressable testID="hc-delete" style={styles.deleteBtn} disabled={remove.isPending} onPress={() => remove.mutate()}>
          <Text style={styles.deleteText}>{remove.isPending ? "Deleting…" : "Delete my health context"}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function Field({ label, value, onChange, placeholder, testID }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; testID: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput testID={testID} style={common.input} value={value} onChangeText={onChange} placeholder={placeholder} autoCapitalize="none" />
    </View>
  );
}

function Segmented({ label, value, onChange, testID }: { label: string; value: OrganFlag | null; onChange: (v: OrganFlag) => void; testID: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.segments} testID={testID}>
        {ORGAN_OPTIONS.map((opt) => (
          <Pressable key={opt} testID={`${testID}-${opt}`} style={[styles.segment, value === opt && styles.segmentOn]} onPress={() => onChange(opt)}>
            <Text style={[styles.segmentText, value === opt && styles.segmentTextOn]}>{opt}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 12 },
  consent: { fontSize: 13, lineHeight: 19, color: "#4a5562" },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: "600", color: "#6b7686" },
  segments: { flexDirection: "row", gap: 8 },
  segment: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: "#d4dae2", alignItems: "center" },
  segmentOn: { backgroundColor: "#208AEF", borderColor: "#208AEF" },
  segmentText: { fontSize: 14, color: "#3a4451", textTransform: "capitalize" },
  segmentTextOn: { color: "#fff", fontWeight: "700" },
  consentRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", paddingVertical: 4 },
  checkbox: { width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: "#208AEF", alignItems: "center", justifyContent: "center" },
  checkboxOn: { backgroundColor: "#208AEF" },
  check: { color: "#fff", fontSize: 14, fontWeight: "900" },
  consentLabel: { flex: 1, fontSize: 13, lineHeight: 19, color: "#3a4451" },
  saved: { color: "#1c7d4d", fontWeight: "700", textAlign: "center" },
  disabled: { opacity: 0.5 },
  deleteBtn: { paddingVertical: 12, alignItems: "center" },
  deleteText: { color: "#c0392b", fontSize: 15, fontWeight: "700" },
});
