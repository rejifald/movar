//
//  AuditAboutView.swift
//  Shared (App)
//
//  What Movar Audit is — its own screen, the way About is Settings'.
//

import SwiftUI

/// The explainer the Audit composer used to carry inline.
///
/// IT WAS TWO SECTIONS AND SIX PARAGRAPHS SITTING UNDER A FORM. That is a lot of
/// prose to scroll past on the screen whose job is "name a site, press the
/// button" — and every one of those paragraphs is read once, by someone deciding
/// whether to trust the tool, and never again. That is the same shape About has,
/// and About is a row behind Settings for exactly this reason: a once-ever
/// destination cannot earn permanent space on a screen people return to.
///
/// So the composer keeps the ONE-LINE answer — `audit.intro`, the section footer
/// under the URL box, which says what an audit reports — and everything that
/// elaborates it moved here, behind a row. Someone weighing the button still
/// gets their sentence without a tap; someone who wants the argument gets a
/// document instead of a preamble.
///
/// TWO SECTIONS, ANSWERING DIFFERENT QUESTIONS: what this tool claims to do, and
/// what it does to somebody else's server while doing it. They were adjacent on
/// the composer and are adjacent here, because the second is the part a reader
/// wants immediately after the first — the audit is the one Movar feature that
/// leaves the device, and burying that would be the wrong thing to bury.
///
/// The screen names itself with {@link movarPushedTitle}, so the first section
/// carries no header: the title already says "What Movar Audit is", and a
/// section header repeating it would set the same words twice, once in small
/// caps. Same reasoning as `AboutView`'s masthead.
struct AuditAboutView: View {

    var body: some View {
        List {
            whatItIsSection
            howItRunsSection
        }
        .movarListStyle()
        .movarPushedTitle(HostStrings.auditAboutTitle)
    }

    /// What the tool is, and the three things it refuses to do.
    ///
    /// No icons on the claims, deliberately — unchanged from the composer. They
    /// are assertions about what the tool does and does not do, not statuses, and
    /// a leading symbol per row would either say the same thing three times or
    /// invent three distinctions the copy does not make.
    private var whatItIsSection: some View {
        Section {
            movarUnhyphenated(HostStrings.auditAboutBody)
            ForEach(HostStrings.auditAboutPoints, id: \.self) { point in
                movarUnhyphenated(point)
            }
        }
    }

    /// The network posture, as three mechanical guarantees.
    ///
    /// These DO take icons, because each names a different mechanism — where the
    /// requests go, what they carry, and what happens when a site refuses — and
    /// the glyph is the shortest way to say they are three separate promises
    /// rather than one restated.
    private var howItRunsSection: some View {
        Section {
            ForEach(Array(HostStrings.auditPrivacyItems.enumerated()), id: \.offset) { index, item in
                Label {
                    movarUnhyphenated(item)
                } icon: {
                    Image(systemName: Self.privacySymbols[index % Self.privacySymbols.count])
                }
            }
        } header: {
            Text(HostStrings.auditPrivacyTitle)
        }
    }

    /// In the order the copy makes its promises: where requests go, what they
    /// carry, and the refusal to judge a site that would not answer.
    private static let privacySymbols = ["arrow.up.right", "hand.raised", "shield.lefthalf.fill"]
}
