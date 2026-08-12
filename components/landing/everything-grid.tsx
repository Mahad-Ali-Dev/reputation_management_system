"use client";

import {
  Bell,
  BrainCircuit,
  Building2,
  FileText,
  Languages,
  LineChart,
  Lock,
  Smartphone,
  Sparkles,
  Users,
  Webhook,
  Zap,
} from "lucide-react";
import { HoverEffect } from "@/components/ui/aceternity/card-hover-effect";

/**
 * EverythingGrid — the "everything included" capability grid using the
 * card-hover-effect. No add-on pricing games: the platform-level capabilities
 * that ship with every plan tier.
 */
export function EverythingGrid() {
  const items = [
    {
      icon: <BrainCircuit size={20} />,
      title: "AI Knowledge Base",
      description:
        "A trained brain that knows your services, hours, policies and FAQs — so every reply and call answer is accurate.",
    },
    {
      icon: <Sparkles size={20} />,
      title: "Brand voice engine",
      description:
        "One voice model flows through reviews, inbox, surveys and the phone line. Approve once; it keeps learning.",
    },
    {
      icon: <Users size={20} />,
      title: "Contact directory (CRM)",
      description:
        "Every customer, with their full reputation timeline — reviews, messages, calls and survey responses.",
    },
    {
      icon: <Zap size={20} />,
      title: "Automation rules",
      description:
        "Trigger from your POS or CRM, wait, branch and send. Build the perfect follow-up without code.",
    },
    {
      icon: <LineChart size={20} />,
      title: "Revenue attribution",
      description:
        "Tie rating lifts and review volume back to revenue, per location, so you can prove the ROI.",
    },
    {
      icon: <Bell size={20} />,
      title: "Smart alerts",
      description:
        "Get pinged the moment a 1-star lands or a dispute opens — escalate to the right person instantly.",
    },
    {
      icon: <Building2 size={20} />,
      title: "Multi-location",
      description:
        "Roll up every storefront into one workspace, with per-location rollups and brand-level governance.",
    },
    {
      icon: <Languages size={20} />,
      title: "Multilingual replies",
      description:
        "Answer customers in their language, still in your tone, across 12 languages out of the box.",
    },
    // {
    //   icon: <Webhook size={20} />,
    //   title: "Open API & webhooks",
    //   description:
    //     "Pipe events anywhere. Native connectors plus a documented REST API and Zapier bridge.",
    // },
    {
      icon: <Smartphone size={20} />,
      title: "Mobile-ready",
      description:
        "Approve replies, answer the inbox and watch your rating climb from any device, anywhere.",
    },
    {
      icon: <FileText size={20} />,
      title: "Dispute center",
      description:
        "Flag, document and respond to unfair reviews with a guided takedown workflow.",
    },
    {
      icon: <Lock size={20} />,
      title: "Roles & audit logs",
      description:
        "Granular RBAC, SSO and full audit trails so the right people touch the right things.",
    },
  ];

  return <HoverEffect items={items} className="mt-8 max-w-6xl mx-auto" />;
}
