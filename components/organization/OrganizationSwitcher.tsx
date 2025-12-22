/**
 * Organization Switcher Component
 * Dropdown to switch between personal workspace and organizations
 */

import { useState, useRef, useEffect } from 'react';
import { Icon } from '../common/Icon';
import { useOrganization } from '../../contexts/OrganizationContext';
import { CreateOrganizationModal } from './CreateOrganizationModal';

export function OrganizationSwitcher() {
  const {
    currentOrganization,
    organizations,
    pendingInvites,
    isLoading,
    switchOrganization,
  } = useOrganization();

  const [isOpen, setIsOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close dropdown on Escape
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const handleSelect = (orgId: string | null) => {
    switchOrganization(orgId);
    setIsOpen(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5">
        <div className="w-6 h-6 rounded bg-white/10 animate-pulse" />
        <div className="w-20 h-4 rounded bg-white/10 animate-pulse" />
      </div>
    );
  }

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        {/* Trigger Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
        >
          {currentOrganization ? (
            <>
              {currentOrganization.logo_url ? (
                <img
                  src={currentOrganization.logo_url}
                  alt={currentOrganization.name}
                  className="w-6 h-6 rounded object-cover"
                />
              ) : (
                <div className="w-6 h-6 rounded bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <Icon name="building" className="w-4 h-4 text-white" />
                </div>
              )}
              <span className="text-sm font-medium text-white max-w-[120px] truncate">
                {currentOrganization.name}
              </span>
            </>
          ) : (
            <>
              <div className="w-6 h-6 rounded bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                <Icon name="user" className="w-4 h-4 text-white" />
              </div>
              <span className="text-sm font-medium text-white">Pessoal</span>
            </>
          )}
          <Icon
            name={isOpen ? 'chevron-up' : 'chevron-down'}
            className="w-4 h-4 text-white/60"
          />

          {/* Invite badge */}
          {pendingInvites.length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs text-white flex items-center justify-center">
              {pendingInvites.length}
            </span>
          )}
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <div className="absolute top-full left-0 mt-2 w-72 bg-gray-800 rounded-xl shadow-xl border border-white/10 overflow-hidden z-50">
            {/* Personal Option */}
            <button
              onClick={() => handleSelect(null)}
              className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors ${
                !currentOrganization ? 'bg-white/10' : ''
              }`}
            >
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center flex-shrink-0">
                <Icon name="user" className="w-5 h-5 text-white" />
              </div>
              <div className="text-left flex-1 min-w-0">
                <div className="font-medium text-white">Minha Conta</div>
                <div className="text-xs text-white/50">Dados pessoais</div>
              </div>
              {!currentOrganization && (
                <Icon name="check" className="w-5 h-5 text-green-400 flex-shrink-0" />
              )}
            </button>

            {/* Divider */}
            {(organizations.length > 0 || pendingInvites.length > 0) && (
              <div className="border-t border-white/10" />
            )}

            {/* Pending Invites */}
            {pendingInvites.length > 0 && (
              <>
                <div className="px-4 py-2 text-xs text-white/40 uppercase tracking-wider">
                  Convites Pendentes
                </div>
                {pendingInvites.map((invite) => (
                  <div
                    key={invite.id}
                    className="flex items-center gap-3 px-4 py-3 bg-yellow-500/10 border-l-2 border-yellow-500"
                  >
                    <div className="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center flex-shrink-0">
                      <Icon name="mail" className="w-5 h-5 text-yellow-400" />
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <div className="font-medium text-white truncate">
                        {invite.organization_name}
                      </div>
                      <div className="text-xs text-white/50">
                        Convidado como {invite.role_name}
                      </div>
                    </div>
                    <a
                      href={`/invites?token=${invite.token}`}
                      className="text-xs text-yellow-400 hover:text-yellow-300 font-medium"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsOpen(false);
                      }}
                    >
                      Ver
                    </a>
                  </div>
                ))}
                <div className="border-t border-white/10" />
              </>
            )}

            {/* Organizations */}
            {organizations.length > 0 && (
              <>
                <div className="px-4 py-2 text-xs text-white/40 uppercase tracking-wider">
                  Organizacoes
                </div>
                {organizations.map((org) => (
                  <button
                    key={org.id}
                    onClick={() => handleSelect(org.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors ${
                      currentOrganization?.id === org.id ? 'bg-white/10' : ''
                    }`}
                  >
                    {org.logo_url ? (
                      <img
                        src={org.logo_url}
                        alt={org.name}
                        className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                        <Icon name="building" className="w-5 h-5 text-white" />
                      </div>
                    )}
                    <div className="text-left flex-1 min-w-0">
                      <div className="font-medium text-white truncate">{org.name}</div>
                      <div className="text-xs text-white/50">
                        {org.role_name} • {org.member_count} membro{org.member_count !== 1 ? 's' : ''}
                      </div>
                    </div>
                    {currentOrganization?.id === org.id && (
                      <Icon name="check" className="w-5 h-5 text-green-400 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </>
            )}

            {/* Create New */}
            <div className="border-t border-white/10" />
            <button
              onClick={() => {
                setIsOpen(false);
                setShowCreateModal(true);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-blue-400"
            >
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                <Icon name="plus" className="w-5 h-5 text-blue-400" />
              </div>
              <span className="font-medium">Criar Organizacao</span>
            </button>
          </div>
        )}
      </div>

      {/* Create Organization Modal */}
      <CreateOrganizationModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />
    </>
  );
}
