import React, { useState } from "react";
import type { TournamentEvent } from "@/types";
import { Button } from "../common/Button";
import { Icon } from "../common/Icon";
import { Card } from "@/components/ui/card";

export const ManualEventModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (event: TournamentEvent) => void;
    day: string;
}> = ({ isOpen, onClose, onSave, day }) => {
    const [formData, setFormData] = useState<Partial<TournamentEvent>>({
        day,
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

    const resetForm = () => {
        setFormData({
            day,
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
        "w-full bg-white/[0.02] border border-white/[0.08] rounded-lg px-3 py-2.5 text-xs text-white outline-none focus:border-white/[0.15] focus:bg-white/[0.04] placeholder:text-white/30 transition-all";
    const labelClass = "text-[10px] text-white/40 uppercase tracking-wider font-medium";

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[300] flex items-center justify-center p-4">
            <Card className="w-full max-w-2xl border border-white/[0.08] bg-[#0a0a0a] rounded-2xl overflow-hidden max-h-[90vh] flex flex-col">
                <div className="px-5 py-4 flex justify-between items-center border-b border-white/[0.06]">
                    <h3 className="text-sm font-medium text-white">
                        Adicionar Torneio
                    </h3>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.06] transition-all"
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

                    {/* Horário e GTD */}
                    <div className="grid grid-cols-3 gap-4">
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

                    {/* Buy-in, Rebuy, Add-on */}
                    <div className="grid grid-cols-3 gap-4">
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
                    </div>

                    {/* Stack, Players, Late Reg, Minutes */}
                    <div className="grid grid-cols-4 gap-4">
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
                        <div className="space-y-1.5">
                            <label className={labelClass}>Blind Time</label>
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
                <div className="px-5 py-4 flex gap-2 border-t border-white/[0.06]">
                    <Button
                        onClick={() => {
                            resetForm();
                            onClose();
                        }}
                        variant="secondary"
                        size="small"
                        className="flex-1 bg-white/[0.04] border-white/[0.08] hover:bg-white/[0.08] hover:border-white/[0.12]"
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
                        className="flex-1 bg-white/[0.1] border-white/[0.15] hover:bg-white/[0.15] hover:border-white/[0.2]"
                        disabled={!formData.name?.trim()}
                    >
                        Salvar Torneio
                    </Button>
                </div>
            </Card>
        </div>
    );
};
