import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';

// ponytail: koneksi printer thermal (Bluetooth/USB) butuh Web Bluetooth/WebUSB — di luar
// cakupan MVP (sama seperti PrinterStep di setup wizard). Halaman ini tempat menyalakannya nanti.
export default function PrinterPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Printer</CardTitle>
          <CardDescription>Sambungkan printer struk thermal (Bluetooth/USB/LAN).</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState>Belum ada printer tersambung. Fitur sambung printer akan segera hadir.</EmptyState>
        </CardContent>
      </Card>
    </div>
  );
}
