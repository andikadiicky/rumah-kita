"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { HouseholdCommand } from "./commands";
import type { Save } from "@/components/household-form";

export function useHouseholdMutation<Command extends { action: string } = HouseholdCommand>(options: { endpoint?: string; missing: string; invalid: string; saved: string; deleted: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [announcement, setAnnouncement] = useState("");
  const lock = useRef(false);
  const refresh = () => startTransition(() => router.refresh());
  const save: Save<Command> = async (command) => {
    if (lock.current || refreshing) return { ok: false, message: "Tunggu perubahan sebelumnya selesai, lalu coba lagi." };
    lock.current = true;
    setSaving(true);
    setAnnouncement("");
    try {
      const response = await fetch(options.endpoint ?? "/api/household", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command), signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        const message = response.status === 401 ? "Sesi Anda berakhir. Isian tetap tersimpan di halaman ini."
          : response.status === 404 ? options.missing
          : response.status === 400 ? options.invalid
          : response.status === 403 ? "Permintaan ditolak. Buka aplikasi dari alamat yang sama, lalu coba lagi."
          : "Perubahan belum dapat disimpan. Tunggu sebentar, lalu coba lagi.";
        return { ok: false, message, login: response.status === 401 };
      }
      setAnnouncement(command.action === "delete" ? options.deleted : options.saved);
      refresh();
      return { ok: true };
    } catch {
      return { ok: false, message: "Koneksi terputus atau terlalu lama. Isian tetap ada. Periksa daftar sebelum mencoba lagi agar tidak menambahkan data dua kali." };
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };
  return { save, refresh, saving, refreshing, busy: saving || refreshing, announcement };
}
