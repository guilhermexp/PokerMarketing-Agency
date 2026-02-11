import React, { useState, useEffect } from "react";
import type { TournamentEvent } from "../../types";
import { Card } from "@/components/ui/card";
import { Button } from "./Button";
import { Icon } from "./Icon";

interface ManualEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (event: TournamentEvent) => void;
  day?: string;
}

export const ManualEventModal: React.FC<ManualEventModalProps> = ({
  isOpen,
  onClose,
  onSave,
  day,
}) => {
  // Get current day name if not provided
  const daysMap = [
    "SUNDAY",
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
  ];
  const currentDay = day || daysMap[new Date().getDay()];

  const [formData, setFormData] = useState<Partial<TournamentEvent>>({
    day: currentDay,
    name: "",
    game: "Hold'em",
    gtd: "0",
    buyIn: "0",
    rebuy: "",
    addOn: "",
    stack: "",
    players: "",
    lateReg: "",
    minutes: "",
    structure: "Regular",
    times: { "-3": "12:00" },
  });

  // Update day when prop changes
  useEffect(() => {
    if (day) {
      setFormData((prev) => ({ ...prev, day }));
    }
  }, [day]);

  const resetForm = () => {
    setFormData({
      day: currentDay,
      name: "",
      game: "Hold'em",
      gtd: "0",
      buyIn: "0",
      rebuy: "",
      addOn: "",
      stack: "",
      players: "",
      lateReg: "",
      minutes: "",
      structure: "Regular",
      times: { "-3": "12:00" },
    });
  };

  if (!isOpen) return null;

  const inputClass =
    "w-full bg-transparent border border-white/[0.06] rounded-md px-3 py-2 text-xs text-white outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/40 aria-invalid:border-destructive placeholder:text-white/20";
  const labelClass = "text-[9px] text-white/30";

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[300] flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl border-white/[0.05] bg-[#0a0a0a] overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-4 py-3 flex justify-between items-center">
          <h3 className="text-[13px] font-semibold text-white">
            Adicionar Torneio
          </h3>
          <button
            onClick={onClose}
            className="text-white/20 hover:text-white transition-colors"
          >
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {/* Nome e Jogo */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-1.5">
              <label className={labelClass}>Nome do Torneio *</label>
              <input
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className={inputClass}
                placeholder="Ex: BIG BANG PKO"
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>Modalidade</label>
              <select
                value={formData.game}
                onChange={(e) =>
                  setFormData({ ...formData, game: e.target.value })
                }
                className={inputClass + " appearance-none cursor-pointer"}
              >
                <option value="Hold'em">Hold'em</option>
                <option value="PLO">PLO</option>
                <option value="PLO5">PLO 5</option>
                <option value="PLO6">PLO 6</option>
                <option value="Mixed">Mixed</option>
                <option value="Stud">Stud</option>
                <option value="Razz">Razz</option>
                <option value="2-7 Triple Draw">2-7 Triple Draw</option>
                <option value="8-Game">8-Game</option>
              </select>
            </div>
          </div>

          {/* Dia da semana */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className={labelClass}>Dia da Semana *</label>
              <select
                value={formData.day}
                onChange={(e) =>
                  setFormData({ ...formData, day: e.target.value })
                }
                className={inputClass + " appearance-none cursor-pointer"}
              >
                <option value="SUNDAY">Domingo</option>
                <option value="MONDAY">Segunda</option>
                <option value="TUESDAY">Terça</option>
                <option value="WEDNESDAY">Quarta</option>
                <option value="THURSDAY">Quinta</option>
                <option value="FRIDAY">Sexta</option>
                <option value="SATURDAY">Sábado</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>Horário (BRT) *</label>
              <input
                type="time"
                value={formData.times?.["-3"]}
                onChange={(e) =>
                  setFormData({ ...formData, times: { "-3": e.target.value } })
                }
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>Estrutura</label>
              <select
                value={formData.structure}
                onChange={(e) =>
                  setFormData({ ...formData, structure: e.target.value })
                }
                className={inputClass + " appearance-none cursor-pointer"}
              >
                <option value="Regular">Regular</option>
                <option value="Turbo">Turbo</option>
                <option value="Hyper">Hyper</option>
                <option value="Super Turbo">Super Turbo</option>
                <option value="Deep Stack">Deep Stack</option>
              </select>
            </div>
          </div>

          {/* GTD e Buy-in */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className={labelClass}>Garantido (GTD)</label>
              <input
                value={formData.gtd}
                onChange={(e) =>
                  setFormData({ ...formData, gtd: e.target.value })
                }
                className={inputClass}
                placeholder="50000"
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>Buy-in ($)</label>
              <input
                value={formData.buyIn}
                onChange={(e) =>
                  setFormData({ ...formData, buyIn: e.target.value })
                }
                className={inputClass}
                placeholder="55"
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>Rebuy ($)</label>
              <input
                value={formData.rebuy}
                onChange={(e) =>
                  setFormData({ ...formData, rebuy: e.target.value })
                }
                className={inputClass}
                placeholder="55"
              />
            </div>
          </div>

          {/* Add-on, Stack, Players */}
          <div className="grid grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <label className={labelClass}>Add-on ($)</label>
              <input
                value={formData.addOn}
                onChange={(e) =>
                  setFormData({ ...formData, addOn: e.target.value })
                }
                className={inputClass}
                placeholder="55"
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>Stack Inicial</label>
              <input
                value={formData.stack}
                onChange={(e) =>
                  setFormData({ ...formData, stack: e.target.value })
                }
                className={inputClass}
                placeholder="50000"
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>Max Players</label>
              <input
                value={formData.players}
                onChange={(e) =>
                  setFormData({ ...formData, players: e.target.value })
                }
                className={inputClass}
                placeholder="Unlimited"
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>Late Reg (min)</label>
              <input
                value={formData.lateReg}
                onChange={(e) =>
                  setFormData({ ...formData, lateReg: e.target.value })
                }
                className={inputClass}
                placeholder="120"
              />
            </div>
          </div>

          {/* Blind Time */}
          <div className="grid grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <label className={labelClass}>Blind Time (min)</label>
              <input
                value={formData.minutes}
                onChange={(e) =>
                  setFormData({ ...formData, minutes: e.target.value })
                }
                className={inputClass}
                placeholder="15"
              />
            </div>
          </div>
        </div>
        <div className="px-4 py-3 flex gap-2">
          <Button
            onClick={() => {
              resetForm();
              onClose();
            }}
            variant="secondary"
            size="small"
            className="flex-1"
          >
            Cancelar
          </Button>
          <Button
            onClick={() => {
              if (!formData.name?.trim()) return;
              onSave({
                ...formData,
                id: `manual-${Date.now()}`,
              } as TournamentEvent);
              resetForm();
              onClose();
            }}
            variant="primary"
            size="small"
            className="flex-1"
            disabled={!formData.name?.trim()}
          >
            Salvar Torneio
          </Button>
        </div>
      </Card>
    </div>
  );
};
