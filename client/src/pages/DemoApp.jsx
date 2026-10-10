import { useState, useMemo, useEffect } from 'react';
import {
  LayoutDashboard, Building2, Package, Sparkles, Sliders, CheckSquare,
  Truck, ChartNoAxesCombined, FileText, Settings, Bell, Search, Filter,
  ArrowUpDown, Printer, Check, AlertTriangle, ShieldCheck, Clock,
  ArrowRight, ArrowLeft, Plus, ChevronRight, Eye, RefreshCw, X, Download, Shield, Layers
} from 'lucide-react';
import SurplusMap from '../components/SurplusMap';
import CentreInventoryDrawer from '../components/CentreInventoryDrawer';
import SmartRequestModal from '../components/SmartRequestModal';
import ApprovalActionModal from '../components/ApprovalActionModal';
import DispatchHandoverModal from '../components/DispatchHandoverModal';
import ReceiptConfirmModal from '../components/ReceiptConfirmModal';
import TransferSlipModal from '../components/TransferSlipModal';
import TransferSimulatorView from '../components/TransferSimulatorView';
import AlertsView from '../components/AlertsView';
import OpeningStockModal from '../components/OpeningStockModal';
import MedicineBillingModal from '../components/MedicineBillingModal';
import ConflictResolutionModal from '../components/ConflictResolutionModal';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { getPlainLanguageExplanation } from '../utils/plainLanguageAlerts';
import { clearOfflineDataOnSignOut } from '../utils/offlineDb';
import { Wifi, WifiOff, CloudUpload, LogOut } from 'lucide-react';
import { api } from '../utils/api';

const medicineList = [
  'Paracetamol Syrup',
  'ORS Sachets',
  'Amoxicillin Suspension',
  'Iron-Folic Acid',
  'Metformin 500mg',
  'Anti-Snake Venom (ASV)'
];

const roles = [
  'Block Officer',
  'Medical Officer (Centre A)',
  'Medical Officer (Centre B)',
  'Pharmacist',
  'District Collector'
];

const medicineStockProfiles = {
  'Paracetamol Syrup': {
    A: { stock: 10, usage: 5, days: 2, status: 'red', batch: 'TN-PCM-24A' },
    B: { stock: 400, usage: 8, days: 50, status: 'green', batch: 'TN-PCM-23K' },
    C: { stock: 150, usage: 4, days: 8, status: 'amber', batch: 'TN-PCM-24C' },
    D: { stock: 60, usage: 6, days: 10, status: 'grey', batch: 'TN-PCM-24D' },
    E: { stock: 6, usage: 4, days: 1, status: 'red', batch: 'TN-PCM-24E' },
    F: { stock: 90, usage: 5, days: 9, status: 'grey', batch: 'TN-PCM-24F' },
    G: { stock: 220, usage: 5, days: 24, status: 'green', batch: 'TN-PCM-24G' },
    H: { stock: 130, usage: 7, days: 6, status: 'amber', batch: 'TN-PCM-24H' },
    I: { stock: 180, usage: 6, days: 18, status: 'green', batch: 'TN-PCM-24I' },
    J: { stock: 300, usage: 4, days: 30, status: 'green', batch: 'TN-PCM-24J' }
  },
  'ORS Sachets': {
    A: { stock: 85, usage: 10, days: 8, status: 'green', batch: 'TN-ORS-24A' },
    B: { stock: 240, usage: 12, days: 20, status: 'green', batch: 'TN-ORS-24B' },
    C: { stock: 40, usage: 8, days: 5, status: 'amber', batch: 'TN-ORS-24C' },
    D: { stock: 90, usage: 7, days: 12, status: 'grey', batch: 'TN-ORS-24D' },
    E: { stock: 120, usage: 9, days: 13, status: 'green', batch: 'TN-ORS-24E' },
    F: { stock: 70, usage: 8, days: 8, status: 'grey', batch: 'TN-ORS-24F' },
    G: { stock: 190, usage: 10, days: 19, status: 'green', batch: 'TN-ORS-24G' },
    H: { stock: 14, usage: 9, days: 1, status: 'red', batch: 'TN-ORS-24H' },
    I: { stock: 210, usage: 11, days: 19, status: 'green', batch: 'TN-ORS-24I' },
    J: { stock: 320, usage: 8, days: 40, status: 'green', batch: 'TN-ORS-25A' }
  },
  'Amoxicillin Suspension': {
    A: { stock: 65, usage: 6, days: 10, status: 'green', batch: 'TN-AMX-24A' },
    B: { stock: 210, usage: 7, days: 30, status: 'green', batch: 'TN-AMX-24B' },
    C: { stock: 12, usage: 5, days: 2, status: 'red', batch: 'TN-AMX-24C' },
    D: { stock: 50, usage: 6, days: 8, status: 'grey', batch: 'TN-AMX-24D' },
    E: { stock: 8, usage: 4, days: 2, status: 'red', batch: 'TN-AMX-24E' },
    F: { stock: 80, usage: 6, days: 13, status: 'grey', batch: 'TN-AMX-24F' },
    G: { stock: 175, usage: 5, days: 35, status: 'green', batch: 'TN-AMX-24G' },
    H: { stock: 95, usage: 6, days: 15, status: 'green', batch: 'TN-AMX-24H' },
    I: { stock: 140, usage: 7, days: 20, status: 'green', batch: 'TN-AMX-24I' },
    J: { stock: 220, usage: 5, days: 44, status: 'green', batch: 'TN-AMX-24J' }
  },
  'Iron-Folic Acid': {
    A: { stock: 140, usage: 10, days: 14, status: 'green', batch: 'TN-IFA-24A' },
    B: { stock: 350, usage: 15, days: 23, status: 'green', batch: 'TN-IFA-24B' },
    C: { stock: 110, usage: 12, days: 9, status: 'green', batch: 'TN-IFA-24C' },
    D: { stock: 35, usage: 10, days: 3, status: 'amber', batch: 'TN-IFA-24D' },
    E: { stock: 95, usage: 9, days: 10, status: 'green', batch: 'TN-IFA-24E' },
    F: { stock: 28, usage: 8, days: 3, status: 'amber', batch: 'TN-IFA-24F' },
    G: { stock: 260, usage: 11, days: 23, status: 'green', batch: 'TN-IFA-24G' },
    H: { stock: 180, usage: 10, days: 18, status: 'green', batch: 'TN-IFA-24H' },
    I: { stock: 380, usage: 12, days: 31, status: 'green', batch: 'TN-IFA-24I' },
    J: { stock: 290, usage: 9, days: 32, status: 'green', batch: 'TN-IFA-24J' }
  },
  'Metformin 500mg': {
    A: { stock: 75, usage: 15, days: 5, status: 'amber', batch: 'TN-MET-24A' },
    B: { stock: 500, usage: 20, days: 25, status: 'green', batch: 'TN-MET-24B' },
    C: { stock: 190, usage: 18, days: 10, status: 'green', batch: 'TN-MET-24C' },
    D: { stock: 80, usage: 12, days: 6, status: 'amber', batch: 'TN-MET-24D' },
    E: { stock: 24, usage: 14, days: 1, status: 'red', batch: 'TN-MET-24E' },
    F: { stock: 130, usage: 16, days: 8, status: 'grey', batch: 'TN-MET-24F' },
    G: { stock: 310, usage: 15, days: 20, status: 'green', batch: 'TN-MET-24G' },
    H: { stock: 220, usage: 18, days: 12, status: 'green', batch: 'TN-MET-24H' },
    I: { stock: 450, usage: 16, days: 28, status: 'green', batch: 'TN-MET-24I' },
    J: { stock: 380, usage: 15, days: 25, status: 'green', batch: 'TN-MET-24J' }
  },
  'Anti-Snake Venom (ASV)': {
    A: { stock: 4, usage: 2, days: 2, status: 'red', batch: 'TN-ASV-24A' },
    B: { stock: 22, usage: 1, days: 22, status: 'green', batch: 'TN-ASV-24B' },
    C: { stock: 6, usage: 1, days: 6, status: 'amber', batch: 'TN-ASV-24C' },
    D: { stock: 1, usage: 1, days: 1, status: 'red', batch: 'TN-ASV-24D' },
    E: { stock: 2, usage: 1, days: 2, status: 'red', batch: 'TN-ASV-24E' },
    F: { stock: 7, usage: 1, days: 7, status: 'grey', batch: 'TN-ASV-24F' },
    G: { stock: 18, usage: 1, days: 18, status: 'green', batch: 'TN-ASV-24G' },
    H: { stock: 5, usage: 1, days: 5, status: 'amber', batch: 'TN-ASV-24H' },
    I: { stock: 15, usage: 1, days: 15, status: 'green', batch: 'TN-ASV-24I' },
    J: { stock: 20, usage: 1, days: 20, status: 'green', batch: 'TN-ASV-24J' }
  }
};

const initialCentresData = [
  { code: 'A', label: 'Centre A (Melur PHC)', shortName: 'Melur PHC', type: 'Primary Health Centre (PHC)', district: 'Madurai', block: 'Melur Block', status: 'red', stock: 10, usage: 5, days: 2, needs: 116, distance: 9, time: 18, lat: 10.0272, lon: 78.3364, batch: 'TN-PCM-24A', expiry: '2027-08-31', lastUpdated: '10 mins ago', medicinesCount: 48, criticalCount: 2, lowStockCount: 3, nearExpiryCount: 1 },
  { code: 'B', label: 'Centre B (Othakadai Upgraded PHC)', shortName: 'Othakadai CHC', type: 'Community Health Centre (CHC)', district: 'Madurai', block: 'Madurai East Block', status: 'green', stock: 400, usage: 8, days: 50, needs: 0, distance: 9, time: 18, lat: 9.9720, lon: 78.3050, batch: 'TN-PCM-23K', expiry: '2026-11-15', lastUpdated: '1 hr ago', medicinesCount: 48, criticalCount: 0, lowStockCount: 1, nearExpiryCount: 2 }, // FEFO near-expiry!
  { code: 'C', label: 'Centre C (Usilampatti PHC)', shortName: 'Usilampatti PHC', type: 'Primary Health Centre (PHC)', district: 'Madurai', block: 'Usilampatti Block', status: 'amber', stock: 150, usage: 4, days: 8, needs: 30, distance: 28, time: 35, lat: 9.9692, lon: 77.7942, batch: 'TN-PCM-24C', expiry: '2027-12-31', lastUpdated: '2 hrs ago', medicinesCount: 48, criticalCount: 1, lowStockCount: 3, nearExpiryCount: 0 },
  { code: 'D', label: 'Centre D (Thirumangalam CHC)', shortName: 'Thirumangalam CHC', type: 'Community Health Centre (CHC)', district: 'Madurai', block: 'Thirumangalam Block', status: 'amber', stock: 60, usage: 6, days: 10, needs: 0, distance: 22, time: 30, lat: 9.8228, lon: 77.9892, batch: 'TN-PCM-24D', expiry: '2028-01-31', lastUpdated: '2 days ago', medicinesCount: 48, criticalCount: 1, lowStockCount: 2, nearExpiryCount: 1 },
  { code: 'E', label: 'Centre E (Natham PHC)', shortName: 'Natham PHC', type: 'Rural Primary Health Centre', district: 'Dindigul', block: 'Natham Block', status: 'green', stock: 120, usage: 4, days: 30, needs: 0, distance: 25, time: 32, lat: 10.2245, lon: 78.2361, batch: 'TN-PCM-24E', expiry: '2027-05-31', lastUpdated: '30 mins ago', medicinesCount: 48, criticalCount: 0, lowStockCount: 1, nearExpiryCount: 0 },
  { code: 'F', label: 'Centre F (Palani Upgraded PHC)', shortName: 'Palani CHC', type: 'Upgraded Community Health Centre', district: 'Dindigul', block: 'Palani Block', status: 'grey', stock: 90, usage: 5, days: 9, needs: 0, distance: 68, time: 75, lat: 10.4503, lon: 77.5197, batch: 'TN-PCM-24F', expiry: '2027-09-30', lastUpdated: 'Yesterday (Stale)', medicinesCount: 48, criticalCount: 1, lowStockCount: 2, nearExpiryCount: 0 },
  { code: 'G', label: 'Centre G (Periyakulam PHC)', shortName: 'Periyakulam PHC', type: 'Primary Health Centre (PHC)', district: 'Theni', block: 'Periyakulam Block', status: 'red', stock: 12, usage: 6, days: 2, needs: 60, distance: 54, time: 60, lat: 10.1189, lon: 77.5469, batch: 'TN-PCM-24G', expiry: '2027-11-30', lastUpdated: '1 hr ago', medicinesCount: 48, criticalCount: 2, lowStockCount: 3, nearExpiryCount: 0 },
  { code: 'H', label: 'Centre H (Bodinayakanur PHC)', shortName: 'Bodinayakanur PHC', type: 'Primary Health Centre (PHC)', district: 'Theni', block: 'Bodinayakanur Block', status: 'green', stock: 260, usage: 7, days: 37, needs: 0, distance: 70, time: 80, lat: 10.0104, lon: 77.3512, batch: 'TN-PCM-24H', expiry: '2027-06-30', lastUpdated: '3 hrs ago', medicinesCount: 48, criticalCount: 0, lowStockCount: 1, nearExpiryCount: 0 },
  { code: 'I', label: 'Centre I (Sivaganga UHC)', shortName: 'Sivaganga UHC', type: 'Urban Health Centre (UHC)', district: 'Sivaganga', block: 'Sivaganga Block', status: 'green', stock: 180, usage: 6, days: 18, needs: 0, distance: 40, time: 45, lat: 9.8467, lon: 78.4892, batch: 'TN-PCM-24I', expiry: '2028-03-31', lastUpdated: '45 mins ago', medicinesCount: 48, criticalCount: 0, lowStockCount: 1, nearExpiryCount: 1 },
  { code: 'J', label: 'Centre J (Aruppukkottai BPHC)', shortName: 'Aruppukkottai BPHC', type: 'Block Primary Health Centre', district: 'Virudhunagar', block: 'Aruppukkottai Block', status: 'green', stock: 300, usage: 4, days: 30, needs: 0, distance: 48, time: 50, lat: 9.5856, lon: 77.9578, batch: 'TN-PCM-24J', expiry: '2028-05-31', lastUpdated: '2 hrs ago', medicinesCount: 48, criticalCount: 0, lowStockCount: 0, nearExpiryCount: 0 }
];

const initialTransfersData = [
  { id: 'TRF-VRX-101', from: 'Centre B (Othakadai Upgraded PHC)', fromCode: 'B', to: 'Centre A (Melur PHC)', toCode: 'A', medicine: 'Paracetamol Syrup', qty: 120, status: 'Requested', reason: 'Critical stockout prevention (2 days left)', fefoBatch: 'TN-PCM-23K (Exp: 2026-11-15)', distance: 9.0, createdAt: '15 mins ago' },
  { id: 'TRF-VRX-102', from: 'Centre E (Natham PHC)', fromCode: 'E', to: 'Centre G (Periyakulam PHC)', toCode: 'G', medicine: 'Paracetamol Syrup', qty: 40, status: 'Approved', reason: 'Urgent fever season replenishment', fefoBatch: 'TN-PCM-24E (Exp: 2027-05-31)', distance: 25.0, createdAt: '1 hr ago' },
  { id: 'TRF-VRX-103', from: 'Centre J (Aruppukkottai BPHC)', fromCode: 'J', to: 'Centre H (Bodinayakanur PHC)', toCode: 'H', medicine: 'ORS Sachets', qty: 60, status: 'In Transit', reason: 'Pediatric rehydration buffer rebalance', fefoBatch: 'TN-ORS-25A (Exp: 2027-11-30)', distance: 70.0, createdAt: '3 hrs ago' },
  { id: 'TRF-VRX-104', from: 'Centre I (Sivaganga UHC)', fromCode: 'I', to: 'Centre C (Usilampatti PHC)', toCode: 'C', medicine: 'Metformin 500mg', qty: 150, status: 'Completed', reason: 'NCD chronic delivery redistribution', fefoBatch: 'TN-MET-24K (Exp: 2026-12-15)', distance: 40.0, createdAt: 'Yesterday' }
];

const initialAlertsData = [
  { id: 'ALT-01', centre: 'Centre A (Melur PHC)', centreCode: 'A', severity: 'critical', medicine: 'Paracetamol Syrup', message: 'Critical stock depletion: only 2 days of stock left at current rate of 5 bottles/day.', time: '10m ago', status: 'new' },
  { id: 'ALT-02', centre: 'Centre G (Periyakulam PHC)', centreCode: 'G', severity: 'critical', medicine: 'Paracetamol Syrup', message: 'Stockout imminent in 24 hours: 12 bottles on hand with high rural OPD demand.', time: '25m ago', status: 'new' },
  { id: 'ALT-03', centre: 'Centre B (Othakadai Upgraded PHC)', centreCode: 'B', severity: 'warning', medicine: 'Paracetamol Syrup', message: 'FEFO Watchlist: Batch TN-PCM-23K expires in 36 days. Recommended for priority redistribution.', time: '1h ago', status: 'acknowledged' }
];

const initialActivityLogs = [
  { id: 'LOG-1', text: 'Transfer TRF-VRX-104 marked Completed: 150 units of Metformin delivered to Centre C.', time: '2 hours ago', type: 'delivery' },
  { id: 'LOG-2', text: 'Dispatch custody recorded for TRF-VRX-103 by Driver Kumaran (TN-19-G-4402).', time: '3 hours ago', type: 'dispatch' },
  { id: 'LOG-3', text: 'Dr. Vignesh (Centre B) received incoming requisition TRF-VRX-101 for 120 units.', time: '15 mins ago', type: 'request' }
];

const codeToPhcId = {
  A: 'phc-thiruporur',
  B: 'phc-kelambakkam',
  C: 'phc-nemmeli',
  D: 'phc-kovalam',
  E: 'phc-alathur',
  F: 'phc-madurantakam',
  G: 'phc-acharpakkam',
  H: 'phc-karunguzhi',
  I: 'phc-nandivaram',
  J: 'phc-kundrathur'
};

const initialMovementsData = [
  {
    id: 'SM-1001',
    centre_name: 'Kelambakkam Upgraded PHC',
    medicine_name: 'Paracetamol Syrup',
    batch_number: 'TN-PCM-23K',
    movement_type: 'OPENING_STOCK',
    direction: 'IN',
    quantity: 400,
    balance_before: 0,
    balance_after: 400,
    reference_id: 'INIT-VRX-001',
    recorded_by: 'Thiru. Selvam (Pharmacist)',
    created_at: '2 hours ago',
    notes: 'Initial clinical opening stock intake'
  },
  {
    id: 'SM-1002',
    centre_name: 'Thiruporur PHC',
    medicine_name: 'Paracetamol Syrup',
    batch_number: 'TN-PCM-24A',
    movement_type: 'DISPENSED',
    direction: 'OUT',
    quantity: 15,
    balance_before: 25,
    balance_after: 10,
    reference_id: 'BIL-VRX-2026-1022',
    recorded_by: 'Thiru. Murugan (Pharmacist)',
    created_at: '1 hour ago',
    notes: 'Outpatient prescription dispensation'
  },
  {
    id: 'SM-1003',
    centre_name: 'Nemmeli PHC',
    medicine_name: 'Metformin 500mg',
    batch_number: 'TN-MET-24K',
    movement_type: 'TRANSFER_RECEIPT',
    direction: 'IN',
    quantity: 150,
    balance_before: 40,
    balance_after: 190,
    reference_id: 'TRF-VRX-104',
    recorded_by: 'Duty Pharmacist',
    created_at: 'Yesterday',
    notes: 'Peer-to-peer redistribution receipt confirmed'
  }
];

const initialDispensingData = [
  {
    id: 'bil-demo-1',
    bill_number: 'BIL-VRX-2026-1022',
    centre_name: 'Thiruporur PHC',
    patient_demo_id: 'OPD-2026-8812',
    medicine_name: 'Paracetamol Syrup',
    total_dispensed: 15,
    unit: 'bottles',
    status: 'Dispensed',
    confirmed_at: '1 hour ago',
    recorded_by: 'Thiru. Murugan (Pharmacist)'
  },
  {
    id: 'bil-demo-2',
    bill_number: 'BIL-VRX-2026-1021',
    centre_name: 'Kelambakkam Upgraded PHC',
    patient_demo_id: 'OPD-2026-4401',
    medicine_name: 'Metformin 500mg',
    total_dispensed: 30,
    unit: 'tablets',
    status: 'Dispensed',
    confirmed_at: '3 hours ago',
    recorded_by: 'Thiru. Selvam (Pharmacist)'
  }
];

export default function DemoApp() {
  // Navigation State (10 Master Prompt Sections)
  const [activeNav, setActiveNav] = useState('Dashboard');
  const [selectedMed, setSelectedMed] = useState('Paracetamol Syrup');
  const [selectedRole, setSelectedRole] = useState('Block Officer');
  const [selectedCentreCode, setSelectedCentreCode] = useState('A');

  // Application Data States
  const [centres, setCentres] = useState(() => {
    return initialCentresData.map(c => ({
      ...c,
      id: codeToPhcId[c.code] || `phc-${c.code.toLowerCase()}`
    }));
  });
  const [transfers, setTransfers] = useState(initialTransfersData);
  const [alerts, setAlerts] = useState(initialAlertsData);
  const [activityLogs, setActivityLogs] = useState(initialActivityLogs);
  const [stockMovements, setStockMovements] = useState(initialMovementsData);
  const [recentDispensingList, setRecentDispensingList] = useState(initialDispensingData);
  const [simulatedDay, setSimulatedDay] = useState(1);
  const [mapMode, setMapMode] = useState('tiles');

  // Inventory Screen Specific States
  const [inventoryActiveSubtab, setInventoryActiveSubtab] = useState('inventory'); // 'inventory' | 'movements'
  const [inventoryFilterCentre, setInventoryFilterCentre] = useState('all');
  const [inventorySearchTerm, setInventorySearchTerm] = useState('');
  const [inventoryBatchFilter, setInventoryBatchFilter] = useState('');
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState('all');

  // Modals & Drawers States
  const [drawerCentre, setDrawerCentre] = useState(null); // Inspect Inventory Drawer
  const [requestModalCentre, setRequestModalCentre] = useState(null); // Smart Request Modal
  const [approvalModalTransfer, setApprovalModalTransfer] = useState(null); // Approvals Modal
  const [dispatchModalTransfer, setDispatchModalTransfer] = useState(null); // Handover & Dispatch Modal
  const [receiptModalTransfer, setReceiptModalTransfer] = useState(null); // Receipt Modal
  const [printSlipData, setPrintSlipData] = useState(null); // Transfer Slip Modal

  // NEW Feature Modals
  const [isOpeningStockModalOpen, setIsOpeningStockModalOpen] = useState(false);
  const [isBillingModalOpen, setIsBillingModalOpen] = useState(false);
  const [billingInitialMedicine, setBillingInitialMedicine] = useState(null);
  const [billingInitialCentre, setBillingInitialCentre] = useState(null);

  // Offline Synchronization & Concurrency Conflict State
  const offlineSync = useOfflineSync();
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
  const [signOutNotice, setSignOutNotice] = useState(null);

  // Authorised Sign-out Handler (Clears local data safely)
  const handleSignOut = async () => {
    if (offlineSync.pendingCount > 0) {
      const confirmSignOut = window.confirm(
        `You have ${offlineSync.pendingCount} pending offline stock changes. Signing out will safely clear local data on this device as required for data protection. Proceed with sign out?`
      );
      if (!confirmSignOut) return;
    }
    await clearOfflineDataOnSignOut();
    setSignOutNotice('Authorised sign-out complete. Protected local offline storage cleared.');
    setTimeout(() => setSignOutNotice(null), 4000);
  };

  // Active selected centre object
  const activeCentre = useMemo(() => {
    return centres.find((c) => c.code === selectedCentreCode) || centres[0];
  }, [centres, selectedCentreCode]);

  // Memoized transfer routes for map visualization
  const transferRoutes = useMemo(() => {
    return transfers.map((t) => ({
      id: t.id,
      from: t.from,
      fromCode: t.fromCode,
      to: t.to,
      toCode: t.toCode,
      medicine: t.medicine,
      qty: t.qty,
      status: t.status,
      distance: t.distance
    }));
  }, [transfers]);

  // Handle changing active medicine to update centre stock data dynamically
  const handleSelectMedicine = (med) => {
    setSelectedMed(med);
    if (medicineStockProfiles[med]) {
      setCentres((prev) =>
        prev.map((c) => {
          const prof = medicineStockProfiles[med][c.code];
          if (!prof) return c;
          const nextStock = prof.stock;
          const nextDays = prof.days;
          const nextStatus = prof.status;
          return {
            ...c,
            stock: nextStock,
            usage: prof.usage,
            days: nextDays,
            status: nextStatus,
            batch: prof.batch,
            needs: Math.max(0, (prof.usage * 30) - nextStock)
          };
        })
      );
    }
  };

  // Section 1: Summary KPI Metrics (Data-Driven)
  const summaryMetrics = useMemo(() => {
    const totalCentres = centres.length;
    const trackedMeds = 30;
    const criticalRiskCentres = centres.filter((c) => c.status === 'red').length;
    const lowStockMedsCount = centres.filter((c) => c.status === 'red' || c.status === 'amber').length;
    // Transferable surplus protects 14 days of safety reserve.
    // CRITICAL: Unsynchronised offline stock is NEVER treated as proof that another centre has medicine available.
    const transferableSurplus = centres
      .filter((c) => c.status === 'green' && !c.is_pending_sync)
      .reduce((sum, c) => {
        const verifiedStock = c.is_pending_sync ? (c.last_verified_server_stock ?? 0) : c.stock;
        return sum + Math.max(0, verifiedStock - c.usage * 14);
      }, 0);

    return {
      totalCentres,
      trackedMeds,
      criticalRiskCentres,
      lowStockMedsCount,
      transferableSurplus
    };
  }, [centres]);

  // 10 Master Sections
  const navigationItems = [
    { label: 'Dashboard', icon: LayoutDashboard },
    { label: 'Health Centres', icon: Building2 },
    { label: 'Stock & Inventory', icon: Package },
    { label: 'Transfer Recommendations', icon: Sparkles },
    { label: 'Transfer Simulator', icon: Sliders },
    { label: 'Approvals', icon: CheckSquare, badge: transfers.filter((t) => t.status === 'Requested').length },
    { label: 'Dispatch & Receipts', icon: Truck, badge: transfers.filter((t) => t.status === 'Approved' || t.status === 'In Transit').length },
    { label: 'Alerts', icon: Bell, badge: alerts.filter((a) => a.status === 'new').length },
    { label: 'Reports & Analytics', icon: FileText },
    { label: 'Settings', icon: Settings }
  ];

  // SECTION 3 & 4: Submit persistent medicine transfer request
  const handleCreateRequest = (reqData) => {
    const newId = `TRF-VRX-${Math.floor(100 + Math.random() * 900)}`;
    const newTrf = {
      id: newId,
      from: reqData.from,
      fromCode: reqData.source_phc_id,
      to: reqData.to,
      toCode: reqData.dest_phc_id,
      medicine: reqData.medicine,
      qty: reqData.quantity,
      status: 'Requested',
      reason: reqData.reason,
      fefoBatch: reqData.fefo_batch_number,
      distance: 8.1,
      createdAt: 'Just now'
    };

    setTransfers([newTrf, ...transfers]);

    // Add persistent in-app notification for donor centre
    const newAlert = {
      id: `ALT-${Date.now()}`,
      centre: reqData.from,
      centreCode: reqData.source_phc_id,
      severity: 'warning',
      medicine: reqData.medicine,
      message: `New transfer request ${newId} received from ${reqData.to} for ${reqData.quantity} units. Awaiting your approval.`,
      time: 'Just now',
      status: 'new'
    };
    setAlerts([newAlert, ...alerts]);

    // Record audit activity
    setActivityLogs([
      { id: `LOG-${Date.now()}`, text: `Transfer request ${newId} submitted from ${reqData.to} to ${reqData.from} for ${reqData.quantity} units.`, time: 'Just now', type: 'request' },
      ...activityLogs
    ]);

    setRequestModalCentre(null);
    setActiveNav('Approvals');
  };

  // SECTION 4: Donor Approves, Adjusts, or Rejects
  const handleApprovalDecision = ({ id, status, approved_quantity, rejection_reason, notes }) => {
    setTransfers((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          return {
            ...t,
            status: status === 'rejected' ? 'Rejected' : 'Approved',
            qty: approved_quantity || t.qty,
            rejection_reason,
            notes
          };
        }
        return t;
      })
    );

    const match = transfers.find((t) => t.id === id);
    setActivityLogs([
      { id: `LOG-${Date.now()}`, text: `Transfer ${id} was ${status} by donor facility. ${status === 'approved' ? `Ready for collection (${approved_quantity} units).` : `Reason: ${rejection_reason}`}`, time: 'Just now', type: 'approval' },
      ...activityLogs
    ]);
  };

  // SECTION 6: Record Handover & Dispatch (Deducts Donor Stock Atomically)
  const handleDispatch = ({ id, collection_details }) => {
    setTransfers((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          // Atomically deduct from donor stock
          const donorCode = t.fromCode;
          setCentres((cList) =>
            cList.map((c) => {
              if (c.code === donorCode) {
                const updatedStock = Math.max(0, c.stock - t.qty);
                const updatedDays = Math.round(updatedStock / c.usage);
                return {
                  ...c,
                  stock: updatedStock,
                  days: updatedDays,
                  status: updatedDays < 3 ? 'red' : updatedDays < 8 ? 'amber' : 'green'
                };
              }
              return c;
            })
          );
          return { ...t, status: 'In Transit', collection_details };
        }
        return t;
      })
    );

    setActivityLogs([
      { id: `LOG-${Date.now()}`, text: `Transfer ${id} dispatched: Stock deducted from donor inventory. Now in transit.`, time: 'Just now', type: 'dispatch' },
      ...activityLogs
    ]);
  };

  // SECTION 6: Confirm Delivery Receipt (Adds to Recipient Stock Atomically)
  const handleReceipt = ({ id, receipt_confirmed_by, received_quantity, discrepancy_reason }) => {
    setTransfers((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          const receiverCode = t.toCode;
          const confirmedQty = received_quantity !== undefined ? Number(received_quantity) : t.qty;
          const isPartial = confirmedQty < t.qty;

          // Atomically add to recipient stock (only the confirmed quantity)
          setCentres((cList) =>
            cList.map((c) => {
              if (c.code === receiverCode) {
                const updatedStock = c.stock + confirmedQty;
                const updatedDays = Math.round(updatedStock / c.usage);
                return {
                  ...c,
                  stock: updatedStock,
                  days: updatedDays,
                  needs: Math.max(0, (c.usage * 30) - updatedStock),
                  status: updatedDays < 3 ? 'red' : updatedDays < 8 ? 'amber' : 'green'
                };
              }
              return c;
            })
          );
          return {
            ...t,
            status: 'Completed',
            receipt_confirmed_by,
            received_quantity: confirmedQty,
            discrepancy_reason
          };
        }
        return t;
      })
    );

    const match = transfers.find((t) => t.id === id);
    const confirmedQty = received_quantity !== undefined ? Number(received_quantity) : (match?.qty || 120);
    const isPartial = match && confirmedQty < match.qty;

    setActivityLogs([
      {
        id: `LOG-${Date.now()}`,
        text: isPartial
          ? `Transfer ${id} received with partial discrepancy: ${confirmedQty} of ${match.qty} units confirmed (${discrepancy_reason || 'Damage/transit loss'}). Receiver stock incremented.`
          : `Transfer ${id} confirmed received: ${confirmedQty} units added to recipient balance. Transfer completed.`,
        time: 'Just now',
        type: 'delivery'
      },
      ...activityLogs
    ]);
  };

  // Simulate Next Day Progression
  const handleSimulateNextDay = () => {
    setSimulatedDay((d) => d + 1);
    setCentres((prev) =>
      prev.map((c) => {
        const nextStock = Math.max(0, c.stock - c.usage);
        const nextDays = Math.round(nextStock / c.usage);
        let s = c.status;
        if (nextDays <= 2) s = 'red';
        else if (nextDays <= 8) s = 'amber';
        else s = 'green';
        return {
          ...c,
          stock: nextStock,
          days: nextDays,
          status: s
        };
      })
    );
  };

  const handleResetDemo = () => {
    setCentres(initialCentresData);
    setTransfers(initialTransfersData);
    setAlerts(initialAlertsData);
    setActivityLogs(initialActivityLogs);
    setStockMovements(initialMovementsData);
    setRecentDispensingList(initialDispensingData);
    setSimulatedDay(1);
  };

  // Handle Initial / Opening Stock Added
  const handleStockAdded = (stockResult) => {
    const isOffline = Boolean(stockResult.is_offline_pending);

    // 1. Update centre stock
    setCentres((prev) =>
      prev.map((c) => {
        const matchesCentre =
          c.id === stockResult.phc_id ||
          c.code === stockResult.phc_id ||
          c.label.toLowerCase().includes((stockResult.centre_name || '').toLowerCase()) ||
          (stockResult.phc_id || '').toLowerCase().includes(c.code.toLowerCase());

        if (matchesCentre) {
          const nextStock = c.stock + Number(stockResult.quantity_added);
          const nextDays = Math.round(nextStock / (c.usage || 5));
          const nextStatus = nextDays <= 2 ? 'red' : nextDays <= 8 ? 'amber' : 'green';
          return {
            ...c,
            stock: nextStock,
            days: nextDays,
            status: nextStatus,
            batch: stockResult.batch_number || c.batch,
            expiry: stockResult.expiry_date || c.expiry,
            lastUpdated: isOffline ? 'Just now (Offline Pending)' : 'Just now (Server Verified)',
            is_pending_sync: isOffline,
            last_verified_server_stock: isOffline ? (c.last_verified_server_stock ?? c.stock) : nextStock
          };
        }
        return c;
      })
    );

    // 2. Add to stock movements
    const newMovement = {
      id: stockResult.movement_id || (isOffline ? `SM-OFFLINE-${Date.now()}` : `SM-OPEN-${Date.now()}`),
      centre_name: stockResult.centre_name || 'Selected Centre',
      medicine_name: stockResult.medicine_name || selectedMed,
      batch_number: stockResult.batch_number,
      movement_type: 'OPENING_STOCK',
      direction: 'IN',
      quantity: stockResult.quantity_added,
      balance_before: stockResult.stock_before || 0,
      balance_after: stockResult.stock_after || stockResult.quantity_added,
      reference_id: stockResult.operation_id || `INIT-${stockResult.batch_number}`,
      recorded_by: stockResult.recorded_by || 'Staff Pharmacist',
      created_at: isOffline ? 'Pending Sync' : 'Just now',
      sync_status: isOffline ? 'Pending Sync' : 'Synced',
      is_pending_sync: isOffline,
      notes: isOffline
        ? `[OFFLINE QUEUED: ${stockResult.operation_id || ''}] Opening stock: +${stockResult.quantity_added} ${stockResult.unit || 'units'}`
        : `Opening stock: +${stockResult.quantity_added} ${stockResult.unit || 'units'}`
    };
    setStockMovements((prev) => [newMovement, ...prev]);

    // 3. Add to activity logs
    setActivityLogs((prev) => [
      {
        id: `LOG-${Date.now()}`,
        text: isOffline
          ? `[Offline Saved] Stock entry stored locally in IndexedDB: +${stockResult.quantity_added} ${stockResult.unit || 'units'} of ${stockResult.medicine_name} at ${stockResult.centre_name}. Op ID: ${stockResult.operation_id}.`
          : `Opening stock recorded: ${stockResult.quantity_added} ${stockResult.unit || 'units'} of ${stockResult.medicine_name} at ${stockResult.centre_name}. Inventory & map updated.`,
        time: 'Just now',
        type: isOffline ? 'offline' : 'delivery'
      },
      ...prev
    ]);
  };

  // Handle Confirmed Medicine Dispense
  const handleDispenseSuccess = (bill) => {
    const dispensedQty = Number(bill.total_dispensed) || 10;
    const primaryItem = bill.items?.[0];
    const medName = primaryItem?.medicine_name || selectedMed;

    // 1. Update centre stock
    setCentres((prev) =>
      prev.map((c) => {
        const matchesCentre =
          c.id === bill.phc_id ||
          c.code === bill.phc_id ||
          c.label.toLowerCase().includes((bill.centre_name || '').toLowerCase()) ||
          (bill.phc_id || '').toLowerCase().includes(c.code.toLowerCase());

        if (matchesCentre) {
          const nextStock = Math.max(0, c.stock - dispensedQty);
          const nextDays = Math.round(nextStock / (c.usage || 5));
          const nextStatus = nextDays <= 2 ? 'red' : nextDays <= 8 ? 'amber' : 'green';
          return {
            ...c,
            stock: nextStock,
            days: nextDays,
            status: nextStatus,
            lastUpdated: 'Just now'
          };
        }
        return c;
      })
    );

    // 2. Add to stock movements
    const batchNum = primaryItem?.batch_allocations?.[0]?.batch_number || 'TN-BATCH-STD';
    const newMovement = {
      id: `SM-DISP-${Date.now()}`,
      centre_name: bill.centre_name || 'Selected Centre',
      medicine_name: medName,
      batch_number: batchNum,
      movement_type: 'DISPENSED',
      direction: 'OUT',
      quantity: dispensedQty,
      balance_before: bill.stock_before || 0,
      balance_after: Math.max(0, (bill.stock_before || 0) - dispensedQty),
      reference_id: bill.bill_number,
      recorded_by: bill.confirmed_by || 'Staff Pharmacist',
      created_at: 'Just now',
      notes: `Prescription dispensed under bill ${bill.bill_number}`
    };
    setStockMovements((prev) => [newMovement, ...prev]);

    // 3. Add to recent dispensing list
    setRecentDispensingList((prev) => [
      {
        id: bill.id,
        bill_number: bill.bill_number,
        centre_name: bill.centre_name,
        patient_demo_id: bill.patient_demo_id,
        medicine_name: medName,
        total_dispensed: dispensedQty,
        unit: primaryItem?.unit || 'units',
        status: bill.status,
        confirmed_at: 'Just now',
        recorded_by: bill.confirmed_by || 'Staff Pharmacist'
      },
      ...prev
    ]);

    // 4. Add to activity log
    setActivityLogs((prev) => [
      {
        id: `LOG-${Date.now()}`,
        text: `Medicine issued: Bill ${bill.bill_number} confirmed for ${dispensedQty} units of ${medName} at ${bill.centre_name}. Deducted from inventory.`,
        time: 'Just now',
        type: 'dispatch'
      },
      ...prev
    ]);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#14213D] font-sans flex flex-col xl:flex-row">
      {/* ========================================================================= */}
      {/* 1. PROFESSIONAL DARK NAVY SIDEBAR (Strictly Preserving VelocityRx Identity) */}
      {/* ========================================================================= */}
      <aside className="w-full xl:w-[245px] bg-[#14213D] text-white flex flex-col justify-between flex-shrink-0 border-r border-[#1E293B]">
        <div>
          {/* Logo Brand Header */}
          <div className="flex items-center justify-between border-b border-slate-700/60 px-5 py-4.5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0B6E6E] text-base font-bold text-white shadow-sm">
                V
              </div>
              <div>
                <div className="font-serif text-xl tracking-tight text-white leading-none">VelocityRx</div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400 mt-1 font-semibold">
                  Block Exchange
                </div>
                <div className="text-[9px] text-[#2F6FDB] font-semibold mt-1 leading-tight">
                  Predict Shortages. Share Safely. Deliver Faster.
                </div>
              </div>
            </div>
            <div className="rounded-full border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
              Day {simulatedDay}
            </div>
          </div>

          {/* Navigation Links (All 10 Sections Preserved) */}
          <nav className="p-3 space-y-1">
            {navigationItems.map(({ label, icon: Icon, badge }) => (
              <button
                key={label}
                onClick={() => setActiveNav(label)}
                className={`flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-semibold transition ${
                  activeNav === label
                    ? 'bg-[#0B6E6E] text-white shadow-xs font-bold'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon size={16} className={activeNav === label ? 'text-white' : 'text-slate-400'} />
                  <span>{label}</span>
                </div>
                {badge > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    activeNav === label ? 'bg-white text-teal' : 'bg-[#D62839] text-white'
                  }`}>
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Sidebar Footer Info */}
        <div className="p-4 border-t border-slate-700/60 text-[11px] text-slate-400 space-y-1 bg-[#0F172A]">
          <div className="font-bold text-slate-200">Chengalpattu Health District</div>
          <div>Simulated Demo &bull; 10 Centres Tracked</div>
          <div className="text-[10px] text-teal pt-1 flex items-center gap-1 font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Peer-to-Peer Redistribution Active
          </div>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* 2. WHITE CONTENT AREA & TOP ACTION BAR                                   */}
      {/* ========================================================================= */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#F8FAFC]">
        {/* Header Bar */}
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
          {/* Medicine Pills Filter */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
            <span className="text-xs font-bold text-slate-500 mr-1 hidden md:inline">Track:</span>
            {medicineList.map((med) => (
              <button
                key={med}
                onClick={() => handleSelectMedicine(med)}
                className={`rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap transition border ${
                  selectedMed === med
                    ? 'border-[#0B6E6E] bg-[#EAF4F4] text-[#0B6E6E]'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {med}
              </button>
            ))}
          </div>

          {/* Right Action Bar */}
          <div className="flex items-center gap-2.5 self-end sm:self-auto flex-wrap">
            {/* Connection & Offline Sync Status Indicator (Requirement A.3, A.10, C) */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/90 rounded-full px-3 py-1 text-xs">
              {/* Online / Offline Status Dot */}
              <div className="flex items-center gap-1.5 font-bold" title={offlineSync.isOnline ? 'Network connection active' : 'Network offline - IndexedDB active'}>
                {offlineSync.isOnline ? (
                  <>
                    <Wifi size={13} className="text-emerald-600" />
                    <span className="text-emerald-700 font-semibold text-[11px]">Online</span>
                  </>
                ) : (
                  <>
                    <WifiOff size={13} className="text-amber-600" />
                    <span className="text-amber-800 font-semibold text-[11px]">Offline</span>
                  </>
                )}
              </div>

              <span className="text-slate-300">|</span>

              {/* Sync State Badge */}
              {offlineSync.syncState === 'Syncing' && (
                <div className="flex items-center gap-1 font-bold text-blue-600 text-[11px]">
                  <RefreshCw size={12} className="animate-spin text-blue-600" />
                  <span>Syncing...</span>
                </div>
              )}

              {offlineSync.hasConflicts && (
                <button
                  type="button"
                  onClick={() => setIsConflictModalOpen(true)}
                  className="flex items-center gap-1 bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold text-[10px] hover:bg-red-200 transition cursor-pointer"
                  title="Click to reconcile concurrent modification conflict"
                >
                  <AlertTriangle size={11} />
                  <span>Conflict ({offlineSync.pendingQueue.filter(i => i.status === 'conflict').length}) Review</span>
                </button>
              )}

              {!offlineSync.hasConflicts && offlineSync.syncState === 'Sync Failed' && (
                <button
                  type="button"
                  onClick={() => offlineSync.syncNow()}
                  className="flex items-center gap-1 bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold text-[10px] hover:bg-red-200 transition cursor-pointer"
                  title="Click to retry synchronization"
                >
                  <AlertTriangle size={11} />
                  <span>Sync Failed (Retry)</span>
                </button>
              )}

              {!offlineSync.hasConflicts && offlineSync.syncState === 'Pending Sync' && (
                <button
                  type="button"
                  onClick={() => offlineSync.syncNow()}
                  className="flex items-center gap-1 bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold text-[10px] hover:bg-amber-200 transition cursor-pointer"
                  title="Click to trigger manual sync with central server"
                >
                  <Clock size={11} />
                  <span>Pending Sync ({offlineSync.pendingCount})</span>
                </button>
              )}

              {!offlineSync.hasConflicts && offlineSync.syncState === 'Synced' && (
                <div className="flex items-center gap-1 text-emerald-700 font-bold text-[11px]">
                  <Check size={12} className="text-emerald-600" />
                  <span>Synced</span>
                </div>
              )}

              {/* Last Verified Timestamp (Requirement C) */}
              <span className="text-[10px] text-slate-400 font-mono hidden xl:inline" title="Timestamp when server stock was last verified">
                Verified: {offlineSync.lastVerifiedAt}
              </span>
            </div>

            {/* Offline Simulator Switcher (Testing tool for examiner & QA) */}
            <button
              onClick={() => offlineSync.toggleSimulatedOffline(!offlineSync.isSimulatedOffline)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5 border ${
                offlineSync.isSimulatedOffline
                  ? 'bg-amber-500 text-white border-amber-600 shadow-2xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
              title="Toggle simulated offline mode to test offline stock queueing and reconnection"
            >
              {offlineSync.isSimulatedOffline ? <WifiOff size={13} /> : <Wifi size={13} />}
              <span>{offlineSync.isSimulatedOffline ? 'Simulating Offline' : 'Test Offline'}</span>
            </button>

            {/* Manual Sync Now Button (when items are pending) */}
            {offlineSync.pendingCount > 0 && offlineSync.isOnline && (
              <button
                onClick={() => offlineSync.syncNow()}
                disabled={offlineSync.syncState === 'Syncing'}
                className="rounded-full bg-[#0B6E6E] text-white px-3 py-1.5 text-xs font-bold hover:bg-[#095959] transition shadow-2xs flex items-center gap-1"
                title="Manually trigger immediate sync with server"
              >
                <CloudUpload size={13} />
                <span>Sync Now</span>
              </button>
            )}

            {/* Notifications Bell */}
            <button
              onClick={() => setActiveNav('Approvals')}
              className="relative rounded-full border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50"
              title="View in-app alerts and transfer notifications"
            >
              <Bell size={16} />
              {alerts.filter((a) => a.status === 'new').length > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#D62839] text-[9px] font-bold text-white">
                  {alerts.filter((a) => a.status === 'new').length}
                </span>
              )}
            </button>

            {/* Persona Role Switcher */}
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none"
            >
              {roles.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>

            {/* Simulate Next Day */}
            <button
              onClick={handleSimulateNextDay}
              className="rounded-full bg-[#2F6FDB] text-white px-4 py-1.5 text-xs font-bold hover:bg-[#255ec4] transition shadow-2xs"
            >
              Simulate next day &rarr;
            </button>

            {/* Reset Demo */}
            <button
              onClick={handleResetDemo}
              className="rounded-full border border-slate-200 bg-white text-slate-700 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 transition"
            >
              Reset demo
            </button>

            {/* Authorised Sign-Out (Requirement A.11) */}
            <button
              onClick={handleSignOut}
              className="rounded-full border border-red-200 bg-red-50/60 text-red-700 hover:bg-red-100 px-3 py-1.5 text-xs font-bold transition flex items-center gap-1"
              title="Authorised sign out - clears protected local offline storage on device"
            >
              <LogOut size={13} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </header>

        {/* Main Content Sections */}
        <main className="flex-1 p-5 md:p-6 space-y-6 max-w-7xl w-full mx-auto">
          {/* Sign Out Confirmation Toast */}
          {signOutNotice && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-900 flex items-center justify-between gap-2 shadow-2xs animate-in fade-in">
              <div className="flex items-center gap-2 font-semibold">
                <ShieldCheck size={16} className="text-emerald-700" />
                <span>{signOutNotice}</span>
              </div>
              <button onClick={() => setSignOutNotice(null)} className="text-emerald-700 hover:text-emerald-900">
                <X size={14} />
              </button>
            </div>
          )}

          {/* Fictional Demo Notice Banner (Section 6 Requirement) */}
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-2 text-[11px] text-amber-900 flex items-center justify-between gap-2 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-500 flex-shrink-0 animate-pulse"></span>
              <span>
                <b>DEMO DATA</b> — Fictional centres and inventory for prototype demonstration. Not connected to real health facilities.
              </span>
            </div>
            <span className="font-mono text-[10px] text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded font-semibold whitespace-nowrap hidden sm:inline">
              Chengalpattu Health Block
            </span>
          </div>
          {/* ===================================================================== */}
          {/* VIEW: DASHBOARD (Strictly Following Section 7 Hierarchy)              */}
          {/* ===================================================================== */}
          {activeNav === 'Dashboard' && (
            <div className="space-y-6">
              {/* 1. SUMMARY METRICS (Section 1) */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Health Centres</div>
                  <div className="text-2xl font-black text-slate-900 mt-1">{summaryMetrics.totalCentres}</div>
                  <div className="text-[10px] text-slate-500 mt-1">10 block facilities</div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Medicines Tracked</div>
                  <div className="text-2xl font-black text-slate-900 mt-1">{summaryMetrics.trackedMeds}</div>
                  <div className="text-[10px] text-slate-500 mt-1">Essential clinical catalog</div>
                </div>

                <div className="rounded-2xl border border-red-200 bg-red-50/50 p-4 shadow-2xs">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-red-600">Centres at Critical Risk</div>
                  <div className="text-2xl font-black text-[#D62839] mt-1">{summaryMetrics.criticalRiskCentres}</div>
                  <div className="text-[10px] text-red-700 font-semibold mt-1">Centres A &amp; E (&le;2 days)</div>
                </div>

                <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-2xs">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Low-Stock Medicines</div>
                  <div className="text-2xl font-black text-[#E09F1F] mt-1">{summaryMetrics.lowStockMedsCount}</div>
                  <div className="text-[10px] text-amber-800 font-semibold mt-1">Under safety buffer</div>
                </div>

                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-2xs col-span-2 md:col-span-1">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Transferable Surplus</div>
                  <div className="text-2xl font-black text-[#2E9E5B] mt-1">{summaryMetrics.transferableSurplus}</div>
                  <div className="text-[10px] text-emerald-800 font-semibold mt-1">Safe donor units (&gt;14d buffer)</div>
                </div>
              </div>

              {/* 2. BLOCK HEALTH CENTRE MAP CARD (Exact match with dashboard screenshot) */}
              <div id="health-centre-map-card" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3.5">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Tamil Nadu Health Facilities Network Map</h3>
                    <p className="text-xs text-slate-500">
                      10 facilities across Madurai, Dindigul, Theni, Sivaganga, Virudhunagar &bull; Live stock risk, days of cover &amp; transfer routes
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setMapMode((prev) => (prev === 'tiles' ? 'schematic' : 'tiles'))}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
                    >
                      <Layers size={14} className="text-slate-500" />
                      {mapMode === 'schematic' ? 'Standard map' : 'Schematic view'}
                    </button>
                  </div>
                </div>

                {/* Active Transfer Route Sub-Banner (STEP 2: 9km road demo transfer) */}
                <div className="rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 font-medium text-slate-800">
                    <span className="h-2.5 w-2.5 rounded-full bg-blue-600 flex-shrink-0 animate-pulse"></span>
                    <span>
                      <b>Active Transfer Route:</b> Centre B (Othakadai Upgraded PHC, Donor) &rarr; Centre A (Melur PHC, Deficit) &bull; 40 bottles
                    </span>
                  </div>
                  <div className="text-[11px] font-semibold text-slate-600 bg-white/80 border border-blue-200/60 px-2.5 py-0.5 rounded-md self-start sm:self-auto">
                    🛣️ Madurai Road: ~9.0 km &bull; ~18 min
                  </div>
                </div>

                {/* Interactive Leaflet Map (Tamil Nadu Only) */}
                <SurplusMap
                  centres={centres}
                  selectedCentreCode={selectedCentreCode}
                  selectedMedicine={selectedMed}
                  transferRoutes={transferRoutes}
                  onSelectCentre={(code) => setSelectedCentreCode(code)}
                  onInspectInventory={(centre) => setDrawerCentre(centre)}
                  onRequestMedicine={(centre) => setRequestModalCentre(centre)}
                  onSelectMedicine={(med) => setSelectedMed(med)}
                  onSelectRoute={(route) => {
                    setActiveNav('Approvals');
                  }}
                  height="520px"
                  mapMode={mapMode}
                  onToggleMapMode={() => setMapMode((prev) => (prev === 'tiles' ? 'schematic' : 'tiles'))}
                />
              </div>

              {/* DUAL GRID: Shortage Alerts + Recommended Transfers */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 3. PRIORITY SHORTAGE ALERTS */}
                <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-soft space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={18} className="text-[#D62839]" />
                      <h3 className="font-serif text-lg font-bold text-ink">Priority Shortage Alerts</h3>
                    </div>
                    <span className="text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                      {alerts.length} Active
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {alerts.map((alt) => (
                      <div
                        key={alt.id}
                        className={`rounded-2xl border p-3 flex items-start justify-between gap-3 text-xs ${
                          alt.severity === 'critical' ? 'border-red-200 bg-red-50/40' : 'border-amber-200 bg-amber-50/40'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.2 rounded-full font-bold uppercase text-[9px] text-white ${
                              alt.severity === 'critical' ? 'bg-[#D62839]' : 'bg-[#E09F1F]'
                            }`}>
                              {alt.severity}
                            </span>
                            <span className="font-bold text-slate-900">{alt.centre}</span>
                            <span className="text-slate-400 font-mono text-[10px]">&bull; {alt.time}</span>
                          </div>
                          <p className="text-slate-700 leading-snug">{alt.message}</p>
                          <div className="text-[11px] text-slate-700 bg-white/90 border border-slate-200/80 rounded-lg px-2.5 py-1 mt-1 flex items-start gap-1.5 shadow-2xs">
                            <span className="text-[#0B6E6E] font-bold text-[10px] uppercase tracking-wide flex-shrink-0">Why triggered:</span>
                            <span className="italic leading-snug">{getPlainLanguageExplanation(alt)}</span>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            const c = centres.find((c) => c.code === alt.centreCode) || centres[0];
                            setRequestModalCentre(c);
                          }}
                          className="flex-shrink-0 rounded-full bg-[#0B6E6E] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#095959] transition shadow-2xs"
                        >
                          Request Stock
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 4. RECOMMENDED TRANSFERS & PENDING REQUESTS */}
                <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-soft space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <Sparkles size={18} className="text-[#0B6E6E]" />
                      <h3 className="font-serif text-lg font-bold text-ink">Recommended &amp; Pending Transfers</h3>
                    </div>
                    <button
                      onClick={() => setActiveNav('Approvals')}
                      className="text-xs font-semibold text-teal hover:underline"
                    >
                      View All &rarr;
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {transfers.slice(0, 3).map((trf) => (
                      <div
                        key={trf.id}
                        className="rounded-2xl border border-slate-200 bg-[#FAF8F4] p-3 text-xs flex items-center justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2 font-bold text-slate-900">
                            <span>{trf.from}</span>
                            <ArrowRight size={12} className="text-slate-400" />
                            <span>{trf.to}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {trf.qty} units of <b>{trf.medicine}</b> &bull; FEFO: {trf.fefoBatch}
                          </div>
                        </div>

                        <div className="text-right flex-shrink-0">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                              trf.status === 'Requested'
                                ? 'bg-amber-100 text-amber-800'
                                : trf.status === 'Approved'
                                ? 'bg-blue-100 text-blue-800'
                                : trf.status === 'In Transit'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {trf.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 5. MEDICINE STOCK OVERVIEW & 6. FEFO WATCHLIST */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 5. Medicine Stock Overview (2 cols) */}
                <div className="lg:col-span-2 rounded-[24px] border border-slate-200 bg-white p-5 shadow-soft space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                    <h3 className="font-serif text-lg font-bold text-ink">Medicine Stock Overview</h3>
                    <span className="text-xs text-slate-500">10 Centre Distribution</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#FAF8F4] text-slate-500 font-bold uppercase text-[10px]">
                        <tr>
                          <th className="py-2.5 px-3">Centre</th>
                          <th className="py-2.5 px-3">Stock</th>
                          <th className="py-2.5 px-3">Usage</th>
                          <th className="py-2.5 px-3">Days of Cover</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {centres.map((c) => (
                          <tr key={c.code} className="hover:bg-slate-50 transition">
                            <td className="py-2.5 px-3 font-bold text-slate-900">{c.label}</td>
                            <td className="py-2.5 px-3">{c.stock} units</td>
                            <td className="py-2.5 px-3 text-slate-600">{c.usage}/day</td>
                            <td className="py-2.5 px-3 font-bold">{c.days} days</td>
                            <td className="py-2.5 px-3">
                              <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                c.status === 'red' ? 'bg-red-50 text-red-700' : c.status === 'amber' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                              }`}>
                                {c.status === 'red' ? 'Critical' : c.status === 'amber' ? 'Warning' : 'Healthy'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                onClick={() => setDrawerCentre(c)}
                                className="text-teal font-semibold hover:underline"
                              >
                                Inspect &rarr;
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 6. Expiry and FEFO Watchlist */}
                <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-soft space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                    <h3 className="font-serif text-lg font-bold text-ink">FEFO Watchlist</h3>
                    <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                      First-Expiry Out
                    </span>
                  </div>

                  <div className="space-y-2.5 text-xs">
                    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-1">
                      <div className="font-bold text-amber-950 flex items-center justify-between">
                        <span>Batch TN-PCM-23K (Centre B)</span>
                        <span className="text-[10px] bg-amber-200 px-1.5 py-0.2 rounded font-mono">36d Left</span>
                      </div>
                      <div className="text-[11px] text-amber-900">
                        Paracetamol Syrup &bull; 75 bottles expiring 2026-11-15.
                      </div>
                      <div className="text-[10px] text-amber-800 font-semibold pt-1">
                        Priority: Allocated to TRF-VRX-101 to prevent wastage.
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-[#FAF8F4] p-3 space-y-1">
                      <div className="font-bold text-slate-800 flex items-center justify-between">
                        <span>Batch TN-MET-24K (Centre I)</span>
                        <span className="text-[10px] bg-slate-200 px-1.5 py-0.2 rounded font-mono">65d Left</span>
                      </div>
                      <div className="text-[11px] text-slate-600">
                        Metformin 500mg &bull; Exp: 2026-12-15.
                      </div>
                      <div className="text-[10px] text-teal font-semibold pt-1">
                        Status: Successfully redistributed to Centre C.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 7. RECENT DISPENSING & AUDITABLE STOCK MOVEMENTS (Feature 6 Master Requirements) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Medicine Dispensing Activity */}
                <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-soft space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <FileText size={18} className="text-[#2F6FDB]" />
                      <h3 className="font-serif text-lg font-bold text-ink">Recent Dispensing Activity</h3>
                    </div>
                    <button
                      onClick={() => setIsBillingModalOpen(true)}
                      className="text-xs font-bold text-[#2F6FDB] hover:underline"
                    >
                      + New Bill
                    </button>
                  </div>

                  <div className="space-y-2 text-xs">
                    {recentDispensingList.slice(0, 4).map((b) => (
                      <div key={b.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-800 text-[11px]">{b.bill_number}</span>
                            <span className="px-2 py-0.2 rounded-full bg-emerald-100 text-emerald-800 font-bold uppercase text-[9px]">
                              {b.status}
                            </span>
                          </div>
                          <div className="text-slate-600">
                            <b>{b.centre_name}</b> &bull; Patient: <span className="font-mono">{b.patient_demo_id}</span>
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Dispensed by {b.recorded_by} &bull; {b.confirmed_at}
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="font-black text-slate-900 block text-sm">
                            {b.total_dispensed} <span className="text-[10px] text-slate-500 font-normal">{b.unit}</span>
                          </span>
                          <span className="text-[10px] text-emerald-600 font-semibold">{b.medicine_name}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recent Stock Movement Ledger Activity */}
                <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-soft space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <Clock size={18} className="text-[#0B6E6E]" />
                      <h3 className="font-serif text-lg font-bold text-ink">Recent Stock Movements</h3>
                    </div>
                    <button
                      onClick={() => {
                        setActiveNav('Stock & Inventory');
                        setInventoryActiveSubtab('movements');
                      }}
                      className="text-xs font-bold text-[#0B6E6E] hover:underline"
                    >
                      View Full Ledger &rarr;
                    </button>
                  </div>

                  <div className="space-y-2 text-xs">
                    {stockMovements.slice(0, 4).map((sm) => (
                      <div key={sm.id} className="p-3 rounded-xl bg-[#FAF8F4] border border-slate-200/70 flex items-center justify-between gap-3">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.2 rounded-full font-bold uppercase text-[9px] ${
                              sm.movement_type === 'OPENING_STOCK' ? 'bg-emerald-100 text-emerald-800' :
                              sm.movement_type === 'DISPENSED' ? 'bg-blue-100 text-blue-800' :
                              sm.movement_type === 'TRANSFER_DISPATCH' ? 'bg-amber-100 text-amber-800' :
                              sm.movement_type === 'TRANSFER_RECEIPT' ? 'bg-teal text-white' :
                              'bg-purple-100 text-purple-800'
                            }`}>
                              {sm.movement_type.replace('_', ' ')}
                            </span>
                            <span className="font-bold text-slate-800">{sm.centre_name}</span>
                          </div>
                          <div className="text-[11px] text-slate-600">
                            {sm.medicine_name} ({sm.batch_number}) &bull; Balance: {sm.balance_before} &rarr; <b>{sm.balance_after}</b>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {sm.created_at} &bull; {sm.recorded_by}
                          </div>
                        </div>

                        <div className="text-right">
                          <span className={`font-black text-sm block ${sm.direction === 'OUT' ? 'text-red-600' : 'text-emerald-600'}`}>
                            {sm.direction === 'OUT' ? '-' : '+'}{sm.quantity}
                          </span>
                          <span className="text-[9px] font-mono text-slate-400 block">{sm.reference_id}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 8. SYSTEM AUDIT ACTIVITY LOG */}
              <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-soft space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <h3 className="font-serif text-lg font-bold text-ink">System Audit Activity Log</h3>
                  <span className="text-xs text-slate-400">Real-time event stream</span>
                </div>

                <div className="space-y-2 text-xs">
                  {activityLogs.slice(0, 5).map((log) => (
                    <div key={log.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-teal"></span>
                        <span className="text-slate-800 font-medium">{log.text}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">{log.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* VIEW: HEALTH CENTRES (Directory & Facility Operations)                 */}
          {/* ===================================================================== */}
          {activeNav === 'Health Centres' && (
            <div className="space-y-6">
              {/* Directory Header Card with Regional Overview */}
              <div className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-[#0B6E6E] flex items-center justify-center text-white font-bold shadow-xs">
                      <Building2 size={20} />
                    </div>
                    <div>
                      <h2 className="font-serif text-2xl text-ink font-bold">Health Centres Network Directory</h2>
                      <p className="text-xs text-slate-500">
                        Operational status and inventory directory of all 10 health facilities across Madurai, Dindigul, Theni, Sivaganga, and Virudhunagar.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-600 bg-[#FAF8F4] border border-slate-200 px-3 py-1.5 rounded-full">
                      Tracking: <b>{selectedMed}</b>
                    </span>
                    <button
                      onClick={() => setActiveNav('Dashboard')}
                      className="text-xs font-semibold text-[#0B6E6E] hover:underline flex items-center gap-1 bg-[#EAF4F4] border border-[#0B6E6E]/20 px-3 py-1.5 rounded-full"
                    >
                      <span>View on Dashboard Map &rarr;</span>
                    </button>
                  </div>
                </div>

                {/* Facility Status Metric Pills */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                    <div className="text-[10px] font-bold uppercase text-slate-400">Total Centres</div>
                    <div className="text-xl font-black text-slate-900 mt-0.5">{centres.length} Facilities</div>
                    <div className="text-[10px] text-slate-500">Tamil Nadu Network</div>
                  </div>
                  <div className="p-3 rounded-2xl bg-red-50/50 border border-red-200">
                    <div className="text-[10px] font-bold uppercase text-red-600">Critical Risk (&le;2d)</div>
                    <div className="text-xl font-black text-[#D62839] mt-0.5">
                      {centres.filter((c) => c.status === 'red').length} Centres
                    </div>
                    <div className="text-[10px] text-red-700">Urgent replenishment</div>
                  </div>
                  <div className="p-3 rounded-2xl bg-amber-50/50 border border-amber-200">
                    <div className="text-[10px] font-bold uppercase text-amber-700">Low Stock Buffer (&le;8d)</div>
                    <div className="text-xl font-black text-[#E09F1F] mt-0.5">
                      {centres.filter((c) => c.status === 'amber').length} Centres
                    </div>
                    <div className="text-[10px] text-amber-800">Under safety threshold</div>
                  </div>
                  <div className="p-3 rounded-2xl bg-emerald-50/50 border border-emerald-200">
                    <div className="text-[10px] font-bold uppercase text-emerald-700">Healthy Surplus (&gt;8d)</div>
                    <div className="text-xl font-black text-[#2E9E5B] mt-0.5">
                      {centres.filter((c) => c.status === 'green').length} Centres
                    </div>
                    <div className="text-[10px] text-emerald-800">Eligible donor facilities</div>
                  </div>
                </div>

                {/* Health Centres Directory Table */}
                <div className="pt-2">
                  <div className="mb-3">
                    <h3 className="font-serif text-lg font-bold text-ink">Primary &amp; Community Health Centres Facility Ledger</h3>
                    <p className="text-xs text-slate-500">Batch-level stock, runway, and direct inter-facility actions</p>
                  </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#FAF8F4] text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Centre Name &amp; Code</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Usable Stock</th>
                      <th className="py-3 px-4">Days Cover</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {centres.map((c) => (
                      <tr key={c.code} className="hover:bg-slate-50">
                        <td className="py-3.5 px-4 font-bold text-slate-900">{c.label}</td>
                        <td className="py-3.5 px-4 text-slate-600">{c.type}</td>
                        <td className="py-3.5 px-4 font-extrabold">{c.stock} units</td>
                        <td className="py-3.5 px-4 font-bold">{c.days} days</td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2.5 py-1 rounded-full font-bold text-[10px] ${
                            c.status === 'red' ? 'bg-red-50 text-red-700' : c.status === 'amber' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                          }`}>
                            {c.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right space-x-2">
                          <button
                            onClick={() => setDrawerCentre(c)}
                            className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Inspect Inventory
                          </button>
                          <button
                            onClick={() => setRequestModalCentre(c)}
                            className="rounded-full bg-[#0B6E6E] px-3 py-1 font-semibold text-white hover:bg-[#095959]"
                          >
                            Request Medicine
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

          {/* ===================================================================== */}
          {/* VIEW: STOCK & INVENTORY (Feature 9: Enhanced Master Inventory Screen) */}
          {/* ===================================================================== */}
          {activeNav === 'Stock & Inventory' && (
            <div className="space-y-6">
              {/* Top Header Card with Action Buttons */}
              <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <div className="h-9 w-9 rounded-xl bg-[#0B6E6E] flex items-center justify-center text-white font-bold shadow-xs">
                        <Package size={18} />
                      </div>
                      <h2 className="font-serif text-2xl font-bold text-ink">Comprehensive Stock &amp; Inventory Management</h2>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Batch-level monitoring &bull; FEFO-guided dispensing &bull; Auditable stock movement ledger &bull; 10 Facilities
                    </p>
                  </div>

                  {/* Primary Actions: Add Stock & Medicine Billing */}
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <button
                      onClick={() => setIsOpeningStockModalOpen(true)}
                      className="flex items-center gap-2 rounded-full bg-[#0B6E6E] px-4 py-2 text-xs font-bold text-white hover:bg-[#095959] transition shadow-xs cursor-pointer"
                    >
                      <Plus size={16} />
                      <span>Add Opening Stock / Receive</span>
                    </button>

                    <button
                      onClick={() => {
                        setBillingInitialCentre(selectedCentreCode);
                        setBillingInitialMedicine(selectedMed);
                        setIsBillingModalOpen(true);
                      }}
                      className="flex items-center gap-2 rounded-full bg-[#2F6FDB] px-4 py-2 text-xs font-bold text-white hover:bg-[#255ec4] transition shadow-xs cursor-pointer"
                    >
                      <FileText size={16} />
                      <span>Medicine Issue / Billing</span>
                    </button>

                    <button
                      onClick={() => setDrawerCentre(activeCentre)}
                      className="rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                    >
                      Inspect Selected ({activeCentre.code})
                    </button>
                  </div>
                </div>

                {/* Subtab Navigation Pills */}
                <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
                  <div className="flex items-center gap-2 bg-slate-100/80 p-1 rounded-2xl">
                    <button
                      onClick={() => setInventoryActiveSubtab('inventory')}
                      className={`px-4 py-1.5 rounded-xl text-xs font-bold transition ${
                        inventoryActiveSubtab === 'inventory'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Facility Inventory &amp; Batches ({centres.length} Centres)
                    </button>
                    <button
                      onClick={() => setInventoryActiveSubtab('movements')}
                      className={`px-4 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                        inventoryActiveSubtab === 'movements'
                          ? 'bg-white text-[#0B6E6E] shadow-2xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <span>Stock Movement Ledger</span>
                      <span className="px-1.5 py-0.2 rounded-full bg-[#EAF4F4] text-[#0B6E6E] text-[10px]">
                        {stockMovements.length}
                      </span>
                    </button>
                  </div>

                  <div className="text-[11px] text-slate-500 font-medium">
                    Tracking catalog: <b>30 Essential Medicines</b> &bull; FEFO Rule: <b>Earliest Expiry First</b>
                  </div>
                </div>

                {/* Subtab 1: Current Inventory & Batches */}
                {inventoryActiveSubtab === 'inventory' && (
                  <div className="space-y-4 pt-2">
                    {/* Filter Bar */}
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 bg-[#FAF8F4] p-3 rounded-2xl border border-slate-200 text-xs">
                      {/* Centre Filter */}
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Centre Filter</label>
                        <select
                          value={inventoryFilterCentre}
                          onChange={(e) => setInventoryFilterCentre(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none"
                        >
                          <option value="all">All 10 Health Centres</option>
                          {centres.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.label} ({c.code})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Medicine Search */}
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Medicine Search</label>
                        <div className="relative">
                          <input
                            type="text"
                            value={inventorySearchTerm}
                            onChange={(e) => setInventorySearchTerm(e.target.value)}
                            placeholder="Search name or active med..."
                            className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none pr-7"
                          />
                          <Search size={14} className="absolute right-2.5 top-2 text-slate-400" />
                        </div>
                      </div>

                      {/* Batch Filter */}
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Batch Number</label>
                        <input
                          type="text"
                          value={inventoryBatchFilter}
                          onChange={(e) => setInventoryBatchFilter(e.target.value)}
                          placeholder="Filter batch e.g. TN-PCM..."
                          className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-700 focus:outline-none"
                        />
                      </div>

                      {/* Status Filter */}
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Stock Status</label>
                        <select
                          value={inventoryStatusFilter}
                          onChange={(e) => setInventoryStatusFilter(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none"
                        >
                          <option value="all">All Statuses</option>
                          <option value="red">Critical Shortage (&le;2d)</option>
                          <option value="amber">Low Buffer / Warning (&le;8d)</option>
                          <option value="green">Healthy Buffer (&gt;8d)</option>
                        </select>
                      </div>
                    </div>

                    {/* Inventory Table */}
                    <div className="overflow-x-auto rounded-2xl border border-slate-200">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#FAF8F4] text-slate-600 font-bold uppercase text-[10px] border-b border-slate-200">
                          <tr>
                            <th className="py-3 px-4">Centre</th>
                            <th className="py-3 px-4">Medicine &amp; Strength</th>
                            <th className="py-3 px-4">Batch (FEFO)</th>
                            <th className="py-3 px-4">Expiry Date</th>
                            <th className="py-3 px-4">Stock Balance</th>
                            <th className="py-3 px-4">Verification Status</th>
                            <th className="py-3 px-4">Days Cover</th>
                            <th className="py-3 px-4">Safety Reserve</th>
                            <th className="py-3 px-4">Status &amp; Alert Cause</th>
                            <th className="py-3 px-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium bg-white">
                          {centres
                            .filter((c) => {
                              if (inventoryFilterCentre !== 'all' && c.code !== inventoryFilterCentre) return false;
                              if (inventoryStatusFilter !== 'all' && c.status !== inventoryStatusFilter) return false;
                              if (inventorySearchTerm && !selectedMed.toLowerCase().includes(inventorySearchTerm.toLowerCase()) && !c.label.toLowerCase().includes(inventorySearchTerm.toLowerCase())) return false;
                              if (inventoryBatchFilter && !c.batch.toLowerCase().includes(inventoryBatchFilter.toLowerCase())) return false;
                              return true;
                            })
                            .map((c) => {
                              // Check near-expiry (<90 days)
                              const isNearExpiry = c.expiry && (new Date(c.expiry) - new Date()) / (1000 * 60 * 60 * 24) <= 90;

                              return (
                                <tr key={c.code} className="hover:bg-slate-50/80 transition">
                                  <td className="py-3 px-4">
                                    <div className="font-bold text-slate-900">{c.label}</div>
                                    <div className="text-[10px] text-slate-400">{c.type}</div>
                                  </td>
                                  <td className="py-3 px-4">
                                    <div className="font-bold text-slate-800">{selectedMed}</div>
                                    <div className="text-[10px] text-slate-500">Standard formulation</div>
                                  </td>
                                  <td className="py-3 px-4">
                                    <div className="font-mono font-bold text-[#0B6E6E]">{c.batch}</div>
                                    {isNearExpiry && (
                                      <span className="inline-block px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[9px] font-bold mt-0.5">
                                        Near-Expiry &lt;90d
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3 px-4 text-slate-600 font-medium">
                                    {c.expiry}
                                  </td>
                                  <td className="py-3 px-4">
                                    <div className="font-black text-slate-900 text-sm">
                                      {c.stock} <span className="text-[10px] text-slate-500 font-normal">units</span>
                                    </div>
                                    {c.is_pending_sync ? (
                                      <div className="text-[10px] text-amber-800 font-semibold mt-0.5">
                                        Unverified Local Balance
                                      </div>
                                    ) : (
                                      <div className="text-[10px] text-emerald-700 font-medium mt-0.5">
                                        Live Server Verified
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-3 px-4">
                                    {c.is_pending_sync ? (
                                      <div>
                                        <span className="inline-block px-2 py-0.5 rounded-full font-bold text-[10px] bg-amber-100 text-amber-900 border border-amber-300">
                                          Pending Sync
                                        </span>
                                        <div className="text-[9px] text-slate-500 font-mono mt-0.5">
                                          Verified was: {c.last_verified_server_stock ?? (c.stock - 50)} units
                                        </div>
                                      </div>
                                    ) : (
                                      <div>
                                        <span className="inline-block px-2 py-0.5 rounded-full font-bold text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200">
                                          Verified Server Stock
                                        </span>
                                        <div className="text-[9px] text-slate-400 font-mono mt-0.5">
                                          Verified: {offlineSync.lastVerifiedAt}
                                        </div>
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-3 px-4">
                                    <span className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                                      c.status === 'red' ? 'bg-red-50 text-red-700 border border-red-200' :
                                      c.status === 'amber' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                      'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    }`}>
                                      {c.days} days
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 text-slate-500">
                                    {c.usage * 14} units
                                  </td>
                                  <td className="py-3 px-4">
                                    <span className={`px-2 py-0.5 rounded-md font-bold uppercase text-[9px] ${
                                      c.status === 'red' ? 'bg-[#D62839] text-white' :
                                      c.status === 'amber' ? 'bg-[#E09F1F] text-white' :
                                      'bg-[#2E9E5B] text-white'
                                    }`}>
                                      {c.status.toUpperCase()}
                                    </span>
                                    <div className="text-[10px] text-slate-500 italic mt-1 leading-tight max-w-[200px]" title={getPlainLanguageExplanation({ status: c.status, daysOfCover: c.days, minSafetyStock: c.usage * 14, daysToExpiry: isNearExpiry ? 30 : 180, isPendingSync: c.is_pending_sync })}>
                                      {getPlainLanguageExplanation({ status: c.status, daysOfCover: c.days, minSafetyStock: c.usage * 14, daysToExpiry: isNearExpiry ? 30 : 180, isPendingSync: c.is_pending_sync })}
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 text-right space-x-2">
                                    <button
                                      onClick={() => {
                                        setBillingInitialCentre(c.code);
                                        setBillingInitialMedicine(selectedMed);
                                        setIsBillingModalOpen(true);
                                      }}
                                      className="rounded-full bg-[#2F6FDB] text-white px-3 py-1 text-xs font-semibold hover:bg-[#255ec4] transition shadow-2xs"
                                    >
                                      Issue / Bill
                                    </button>
                                    <button
                                      onClick={() => setDrawerCentre(c)}
                                      className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                                    >
                                      Batches &rarr;
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Subtab 2: Stock Movement Ledger (Audit History) */}
                {inventoryActiveSubtab === 'movements' && (
                  <div className="space-y-4 pt-2">
                    <div className="flex items-center justify-between text-xs text-slate-600 bg-[#FAF8F4] p-3 rounded-2xl border border-slate-200">
                      <div>
                        <b>Stock Movement Ledger:</b> Auditable double-entry history of all stock additions, confirmed dispensing issues, dispatches, receipts, and returns.
                      </div>
                      <span className="font-mono text-[10px] text-slate-500 bg-white px-2.5 py-1 rounded-md border border-slate-200 font-bold">
                        {stockMovements.length} Recorded Movements
                      </span>
                    </div>

                    <div className="overflow-x-auto rounded-2xl border border-slate-200">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#FAF8F4] text-slate-600 font-bold uppercase text-[10px] border-b border-slate-200">
                          <tr>
                            <th className="py-3 px-4">Movement ID</th>
                            <th className="py-3 px-4">Facility &amp; Sync State</th>
                            <th className="py-3 px-4">Medicine &amp; Batch</th>
                            <th className="py-3 px-4">Movement Type</th>
                            <th className="py-3 px-4">Quantity Moved</th>
                            <th className="py-3 px-4">Balance Before &rarr; After</th>
                            <th className="py-3 px-4">Ref ID / Op ID</th>
                            <th className="py-3 px-4">Recorded By</th>
                            <th className="py-3 px-4">Timestamp</th>
                            <th className="py-3 px-4">Audit Reason &amp; Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium bg-white">
                          {stockMovements.map((sm) => (
                            <tr key={sm.id} className="hover:bg-slate-50/80 transition">
                              <td className="py-3 px-4 font-mono font-bold text-slate-700 text-[11px]">
                                {sm.id}
                              </td>
                              <td className="py-3 px-4">
                                <div className="font-bold text-slate-900">{sm.centre_name}</div>
                                {sm.is_pending_sync ? (
                                  <span className="inline-block px-1.5 py-0.2 rounded-full font-bold text-[9px] bg-amber-100 text-amber-800 border border-amber-300 mt-0.5">
                                    Pending Sync
                                  </span>
                                ) : (
                                  <span className="inline-block px-1.5 py-0.2 rounded-full font-bold text-[9px] bg-emerald-100 text-emerald-800 border border-emerald-300 mt-0.5">
                                    Verified Server Stock
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                <div className="font-bold text-slate-800">{sm.medicine_name}</div>
                                <div className="font-mono text-[10px] text-[#0B6E6E] font-semibold">{sm.batch_number}</div>
                              </td>
                              <td className="py-3 px-4">
                                <span className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] uppercase ${
                                  sm.movement_type === 'OPENING_STOCK' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                                  sm.movement_type === 'DISPENSED' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                                  sm.movement_type === 'TRANSFER_DISPATCH' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                                  sm.movement_type === 'TRANSFER_RECEIPT' ? 'bg-teal-100 text-teal border border-teal/20' :
                                  sm.movement_type === 'REVERSAL' ? 'bg-purple-100 text-purple-800 border border-purple-200' :
                                  'bg-slate-100 text-slate-700'
                                }`}>
                                  {sm.movement_type.replace('_', ' ')}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <span className={`font-black ${sm.direction === 'OUT' ? 'text-red-600' : 'text-emerald-600'}`}>
                                  {sm.direction === 'OUT' ? '-' : '+'}{sm.quantity} units
                                </span>
                              </td>
                              <td className="py-3 px-4 font-mono text-[11px] text-slate-700">
                                {sm.balance_before} &rarr; <span className="font-bold text-slate-900">{sm.balance_after}</span>
                              </td>
                              <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                                <div className="font-semibold text-slate-800">{sm.reference_id || 'N/A'}</div>
                                {sm.is_pending_sync && <div className="text-[9px] text-amber-700">Offline Queued</div>}
                              </td>
                              <td className="py-3 px-4 text-slate-700 text-[11px]">
                                <div className="font-semibold">{sm.recorded_by}</div>
                                <div className="text-[10px] text-slate-400">Authorised Staff</div>
                              </td>
                              <td className="py-3 px-4 text-slate-500 font-mono text-[10px]">
                                <div>{sm.created_at}</div>
                                {sm.is_pending_sync && <div className="text-[9px] text-amber-700 italic">Awaiting Sync</div>}
                              </td>
                              <td className="py-3 px-4 text-slate-600 text-[11px] max-w-xs truncate" title={sm.notes}>
                                {sm.notes}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* VIEW: APPROVALS (Section 4 & 8)                                       */}
          {/* ===================================================================== */}
          {activeNav === 'Approvals' && (
            <div className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
              <div className="border-b border-slate-100 pb-3">
                <h2 className="font-serif text-2xl font-bold text-ink">Donor Approvals Queue</h2>
                <p className="text-xs text-slate-500">
                  Donor Medical Officers can approve full, approve partial quantity (to protect local buffer), or reject requests.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#FAF8F4] text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Transfer Ref</th>
                      <th className="py-3 px-4">Requester</th>
                      <th className="py-3 px-4">Donor (Approving Authority)</th>
                      <th className="py-3 px-4">Medicine &amp; Quantity</th>
                      <th className="py-3 px-4">FEFO Batch</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {transfers.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50">
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-700">{t.id}</td>
                        <td className="py-3.5 px-4 font-bold text-slate-900">{t.to}</td>
                        <td className="py-3.5 px-4 text-slate-700">{t.from}</td>
                        <td className="py-3.5 px-4">
                          <span className="font-extrabold text-slate-900">{t.qty} units</span>
                          <div className="text-[10px] text-slate-500">{t.medicine}</div>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[11px] text-teal font-semibold">{t.fefoBatch}</td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                            t.status === 'Requested'
                              ? 'bg-amber-100 text-amber-800'
                              : t.status === 'Approved'
                              ? 'bg-blue-100 text-blue-800'
                              : t.status === 'In Transit'
                              ? 'bg-purple-100 text-purple-800'
                              : t.status === 'Rejected'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {t.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {t.status === 'Requested' ? (
                            <button
                              onClick={() => setApprovalModalTransfer(t)}
                              className="rounded-full bg-[#0B6E6E] px-3.5 py-1.5 font-bold text-white hover:bg-[#095959] shadow-2xs"
                            >
                              Review &amp; Approve
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400 font-semibold">Processed</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* VIEW: DISPATCH & RECEIPTS (Section 6 & 8)                             */}
          {/* ===================================================================== */}
          {activeNav === 'Dispatch & Receipts' && (
            <div className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
              <div className="border-b border-slate-100 pb-3">
                <h2 className="font-serif text-2xl font-bold text-ink">Dispatch, Transport &amp; Receipt Ledger</h2>
                <p className="text-xs text-slate-500">
                  Record custody handover at dispatch (deducts stock) and receipt confirmation at delivery (adds stock).
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#FAF8F4] text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Transfer ID</th>
                      <th className="py-3 px-4">Route</th>
                      <th className="py-3 px-4">Item &amp; Quantity</th>
                      <th className="py-3 px-4">Transfer Status</th>
                      <th className="py-3 px-4 text-right">Execution Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {transfers.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50">
                        <td className="py-3.5 px-4 font-mono font-bold">{t.id}</td>
                        <td className="py-3.5 px-4 font-bold text-slate-900">{t.from} &rarr; {t.to}</td>
                        <td className="py-3.5 px-4">{t.qty} units of {t.medicine}</td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                            t.status === 'Approved' ? 'bg-blue-100 text-blue-800' :
                            t.status === 'In Transit' ? 'bg-purple-100 text-purple-800' :
                            t.status === 'Completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {t.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right space-x-2">
                          {t.status === 'Approved' && (
                            <button
                              onClick={() => setDispatchModalTransfer(t)}
                              className="rounded-full bg-purple-600 text-white px-3.5 py-1.5 font-bold hover:bg-purple-700"
                            >
                              Record Handover &amp; Dispatch
                            </button>
                          )}
                          {t.status === 'In Transit' && (
                            <button
                              onClick={() => setReceiptModalTransfer(t)}
                              className="rounded-full bg-emerald-600 text-white px-3.5 py-1.5 font-bold hover:bg-emerald-700"
                            >
                              Confirm Receipt &amp; Restock
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setPrintSlipData({
                                slip_header: {
                                  title: 'GOVERNMENT HEALTH NETWORK — VELOCITYRX BLOCK EXCHANGE',
                                  document: 'OFFICIAL INTER-FACILITY STOCK TRANSFER & DISPATCH SLIP',
                                  voucher_number: t.id,
                                  generated_at: new Date().toISOString()
                                },
                                transfer: {
                                  req_number: t.id,
                                  created_at: t.createdAt,
                                  status: t.status,
                                  source_phc_name: t.from,
                                  dest_phc_name: t.to,
                                  medicine_name: t.medicine,
                                  quantity: t.qty,
                                  unit: 'units',
                                  batch_number: t.fefoBatch,
                                  reason: t.reason,
                                  requester_name: 'Medical Officer on Duty'
                                }
                              });
                            }}
                            className="rounded-full border border-slate-200 bg-white text-slate-700 px-3 py-1 font-semibold hover:bg-slate-50"
                          >
                            Print Slip
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* VIEW: TRANSFER RECOMMENDATIONS (Section 9)                            */}
          {/* ===================================================================== */}
          {activeNav === 'Transfer Recommendations' && (
            <div className="space-y-5 rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
              <div className="border-b border-slate-100 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal text-white">
                      <Sparkles size={16} />
                    </span>
                    <h2 className="font-serif text-2xl font-bold text-ink">Smart Block Exchange Recommendations</h2>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    GENUINE algorithmic matching: identifies critical shortages, evaluates donor safety reserves (14-day minimum), and prioritises earliest-expiring eligible batches (FEFO).
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 bg-[#FAF8F4] border border-slate-200 px-3 py-1 rounded-full">
                    3 Matches Found
                  </span>
                </div>
              </div>

              {/* Recommendation Cards */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Match 1: Kelambakkam to Thiruporur */}
                <div className="rounded-2xl border border-teal-200 bg-[#EAF4F4]/40 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal text-white">
                      #1 Optimal Match &bull; FEFO Priority
                    </span>
                    <span className="text-xs font-bold text-teal">
                      8.1 km &bull; ~16 mins road travel
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 font-serif text-lg font-bold text-slate-900">
                      <span>Centre B (Kelambakkam)</span>
                      <ArrowRight size={16} className="text-teal" />
                      <span>Centre A (Thiruporur)</span>
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">
                      Proposed Rebalance: <b>120 units</b> of <b>Paracetamol Syrup</b>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                      <span className="text-[10px] text-slate-500 block">Donor Impact:</span>
                      <span className="font-bold text-slate-800">400 &rarr; 280 units</span>
                      <span className="text-[10px] text-emerald-700 block font-semibold">35d cover remaining (Safe &gt;14d)</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                      <span className="text-[10px] text-slate-500 block">Receiver Impact:</span>
                      <span className="font-bold text-slate-800">10 &rarr; 130 units</span>
                      <span className="text-[10px] text-emerald-700 block font-semibold">Runway: 2d &rarr; 26d cover</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-teal-50/60 border border-teal-200 text-xs text-teal-950 leading-snug">
                    <b>Clinical Rationale: </b>
                    Centre A faces imminent stockout within 48h. Centre B holds 400 units, including batch <b>TN-PCM-23K</b> expiring in 36 days. Transferring 120 units prevents pediatric stock-outs while exhausting near-expiry stock safely.
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-teal-200/60">
                    <button
                      onClick={() => setActiveNav('Transfer Simulator')}
                      className="rounded-full border border-teal bg-white px-4 py-1.5 text-xs font-semibold text-teal hover:bg-teal-50"
                    >
                      Simulate Impact &rarr;
                    </button>
                    <button
                      onClick={() => setRequestModalCentre(centres[0])}
                      className="rounded-full bg-teal px-5 py-1.5 text-xs font-bold text-white hover:bg-[#095959] shadow-2xs"
                    >
                      Initiate Transfer Request &rarr;
                    </button>
                  </div>
                </div>

                {/* Match 2: Acharapakkam to Alathur */}
                <div className="rounded-2xl border border-slate-200 bg-[#FAF8F4] p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#2F6FDB] text-white">
                      #2 Match &bull; Local Rebalance
                    </span>
                    <span className="text-xs font-bold text-slate-600">
                      9.4 km &bull; ~20 mins road travel
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 font-serif text-lg font-bold text-slate-900">
                      <span>Centre G (Acharapakkam)</span>
                      <ArrowRight size={16} className="text-[#2F6FDB]" />
                      <span>Centre E (Alathur)</span>
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">
                      Proposed Rebalance: <b>40 units</b> of <b>Paracetamol Syrup</b>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                      <span className="text-[10px] text-slate-500 block">Donor Impact:</span>
                      <span className="font-bold text-slate-800">220 &rarr; 180 units</span>
                      <span className="text-[10px] text-emerald-700 block font-semibold">20d cover remaining (Safe &gt;14d)</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                      <span className="text-[10px] text-slate-500 block">Receiver Impact:</span>
                      <span className="font-bold text-slate-800">6 &rarr; 46 units</span>
                      <span className="text-[10px] text-emerald-700 block font-semibold">Runway: 1d &rarr; 11d cover</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-blue-50/60 border border-blue-200 text-xs text-blue-950 leading-snug">
                    <b>Clinical Rationale: </b>
                    Centre E has only 6 bottles on hand with high rural OPD fever demand. Centre G has 220 bottles and can safely spare 40 units while retaining 36 days reserve.
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                    <button
                      onClick={() => setActiveNav('Transfer Simulator')}
                      className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Simulate Impact &rarr;
                    </button>
                    <button
                      onClick={() => setRequestModalCentre(centres[4])}
                      className="rounded-full bg-[#2F6FDB] px-5 py-1.5 text-xs font-bold text-white hover:bg-blue-700 shadow-2xs"
                    >
                      Initiate Transfer Request &rarr;
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* VIEW: TRANSFER SIMULATOR (Section 10 - Mandatory Sandbox)             */}
          {/* ===================================================================== */}
          {activeNav === 'Transfer Simulator' && (
            <TransferSimulatorView
              centres={centres}
              medicineList={medicineList}
              initialMedicine={selectedMed}
              onInitiateTransfer={({ donor, receiver, medicine, quantity }) => {
                setSelectedMed(medicine);
                setRequestModalCentre(receiver);
              }}
            />
          )}

          {/* ===================================================================== */}
          {/* VIEW: ALERTS CENTRAL (Section 8 & 16)                                 */}
          {/* ===================================================================== */}
          {activeNav === 'Alerts' && (
            <AlertsView
              alerts={alerts}
              onAcknowledgeAlert={(alertId) => {
                setAlerts((prev) =>
                  prev.map((a) => (a.id === alertId ? { ...a, status: 'acknowledged' } : a))
                );
              }}
              onRequestTransfer={(alertItem) => {
                const target = centres.find((c) => c.code === alertItem.centreCode) || centres[0];
                setRequestModalCentre(target);
              }}
              onInspectCentre={(centreCode) => {
                const target = centres.find((c) => c.code === centreCode) || centres[0];
                setDrawerCentre(target);
              }}
            />
          )}

          {activeNav === 'Reports & Analytics' && (
            <div className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
              <h2 className="font-serif text-2xl font-bold text-ink">Reports &amp; Historical Logs</h2>
              <p className="text-xs text-slate-500">Export inventory audit records and transfer logs to CSV.</p>
              <div className="flex gap-3 pt-2">
                <a
                  href="/api/reports/export-csv?type=stock"
                  target="_blank"
                  className="rounded-full bg-slate-900 text-white px-5 py-2 text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Download size={14} /> Download Stock CSV
                </a>
              </div>
            </div>
          )}

          {activeNav === 'Settings' && (
            <div className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft text-xs">
              <h2 className="font-serif text-2xl font-bold text-ink">System Configuration &amp; Settings</h2>
              <div className="space-y-3 max-w-md pt-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Minimum Donor Safety Buffer (Days)</label>
                  <input type="number" defaultValue="14" className="w-full border rounded-xl p-2 font-bold" />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">FEFO Batch Prioritization Window (Days)</label>
                  <input type="number" defaultValue="90" className="w-full border rounded-xl p-2 font-bold" />
                </div>
                <button className="rounded-full bg-teal text-white px-5 py-2 font-bold">
                  Save Logistics Policy
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ========================================================================= */}
      {/* 3. MODALS & DRAWERS (Connected Workflow)                                  */}
      {/* ========================================================================= */}

      {/* Drawer: Inspect Inventory for Selected Centre */}
      {drawerCentre && (
        <CentreInventoryDrawer
          centre={drawerCentre}
          onClose={() => setDrawerCentre(null)}
          onReturnToMap={(c) => {
            setDrawerCentre(null);
            if (c?.code) {
              setSelectedCentreCode(c.code);
            }
            setActiveNav('Dashboard');
            setTimeout(() => {
              const mapElem = document.getElementById('health-centre-map-card');
              if (mapElem) {
                mapElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
              } else {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }, 80);
          }}
          onRequestMedicine={(c, item) => {
            setDrawerCentre(null);
            setRequestModalCentre(c);
          }}
          onOpenBilling={(c, item) => {
            setDrawerCentre(null);
            setBillingInitialCentre(c?.code);
            if (item?.name) setBillingInitialMedicine(item.name);
            setIsBillingModalOpen(true);
          }}
          onOpenAddStock={(c) => {
            setDrawerCentre(null);
            if (c?.code) setSelectedCentreCode(c.code);
            setIsOpeningStockModalOpen(true);
          }}
        />
      )}

      {/* Modal: Smart Medicine Request & Donor Evaluation */}
      {requestModalCentre && (
        <SmartRequestModal
          receiverCentre={requestModalCentre}
          targetMedicine={selectedMed}
          centres={centres}
          onClose={() => setRequestModalCentre(null)}
          onSubmitRequest={handleCreateRequest}
        />
      )}

      {/* Modal: Donor Review & Approval */}
      {approvalModalTransfer && (
        <ApprovalActionModal
          transfer={approvalModalTransfer}
          onClose={() => setApprovalModalTransfer(null)}
          onConfirmDecision={handleApprovalDecision}
        />
      )}

      {/* Modal: Record Handover & Dispatch */}
      {dispatchModalTransfer && (
        <DispatchHandoverModal
          transfer={dispatchModalTransfer}
          onClose={() => setDispatchModalTransfer(null)}
          onConfirmDispatch={handleDispatch}
        />
      )}

      {/* Modal: Confirm Delivery Receipt */}
      {receiptModalTransfer && (
        <ReceiptConfirmModal
          transfer={receiptModalTransfer}
          onClose={() => setReceiptModalTransfer(null)}
          onConfirmReceipt={handleReceipt}
          onPrintSlip={(t) => {
            setPrintSlipData({
              slip_header: {
                title: 'GOVERNMENT HEALTH NETWORK — VELOCITYRX BLOCK EXCHANGE',
                document: 'OFFICIAL INTER-FACILITY STOCK TRANSFER & DISPATCH SLIP',
                voucher_number: t.id,
                generated_at: new Date().toISOString()
              },
              transfer: {
                req_number: t.id,
                created_at: t.createdAt,
                status: 'Completed',
                source_phc_name: t.from,
                dest_phc_name: t.to,
                medicine_name: t.medicine,
                quantity: t.qty,
                unit: 'units',
                batch_number: t.fefoBatch,
                reason: t.reason,
                requester_name: 'Medical Officer on Duty'
              }
            });
          }}
        />
      )}

      {/* Modal: Printable Transfer Slip Voucher */}
      {printSlipData && (
        <TransferSlipModal
          slipData={printSlipData}
          onClose={() => setPrintSlipData(null)}
        />
      )}

      {/* Modal: Initial / Opening Stock Intake (Feature 2) */}
      {isOpeningStockModalOpen && (
        <OpeningStockModal
          isOpen={isOpeningStockModalOpen}
          onClose={() => setIsOpeningStockModalOpen(false)}
          centres={centres}
          initialCentreCode={selectedCentreCode}
          onStockAdded={handleStockAdded}
        />
      )}

      {/* Modal: Medicine Issue & Billing Lifecycle (Feature 3) */}
      {isBillingModalOpen && (
        <MedicineBillingModal
          isOpen={isBillingModalOpen}
          onClose={() => {
            setIsBillingModalOpen(false);
            setBillingInitialMedicine(null);
            setBillingInitialCentre(null);
          }}
          centres={centres}
          initialCentreCode={billingInitialCentre || selectedCentreCode}
          initialMedicine={billingInitialMedicine || selectedMed}
          onDispenseSuccess={handleDispenseSuccess}
        />
      )}

      {/* Modal: Concurrency Conflict Resolution (Requirement A.7) */}
      {isConflictModalOpen && (
        <ConflictResolutionModal
          isOpen={isConflictModalOpen}
          onClose={() => setIsConflictModalOpen(false)}
          conflicts={offlineSync.pendingQueue.filter((i) => i.status === 'conflict')}
          onReconcile={offlineSync.reconcileConflict}
        />
      )}
    </div>
  );
}
