import { truncateText } from './utils/text.js';
import { getRole } from './a11y/roles.js';
import { getAccessibleName, getAccessibleDescription } from './a11y/names.js';
import { isLandmark } from './a11y/landmarks.js';
import { shouldExclude } from './filters/exclusion.js';
import { collectAttributes } from './snapshot/attributes.js';
import { collectComputed } from './snapshot/computed.js';
import { buildSnapshotNodeFactory } from './snapshot/node_builder.js';
import { computeChildrenExclusion, shouldExcludeByParentChildDuplicate } from './filters/duplicates.js';

(function () {
    window.__weaveDomSnapshot = function(config) {
        const snapshot = {};

        if (!config) {
            console.error('Configuration object is required');
            return;
        }

        const state = {
            refPrefix: 'e',
            refCounter: 1,
            refInjectedCount: 0,
            totalProcessed: 0,
            totalIncluded: 0
        };

        const buildSnapshotNode = buildSnapshotNodeFactory({
            state,
            truncateText,
            getRole,
            getAccessibleName,
            getAccessibleDescription,
            isLandmark,
            shouldExclude,
            computeChildrenExclusion,
            shouldExcludeByParentChildDuplicate,
            collectAttributes,
            collectComputed
        });

        const rootElement = document.body || document.documentElement;
        if (rootElement) {
            const treeOrList = buildSnapshotNode(rootElement, 0, config);
            snapshot.meta = {
                url: (document && document.location && document.location.href) || '',
                title: (document && document.title) || '',
                refInjectedCount: state.refInjectedCount,
                totalProcessed: state.totalProcessed,
                totalIncluded: state.totalIncluded,
                refStart: 1,
                refPrefix: state.refPrefix
            };
            if (Array.isArray(treeOrList)) {
                snapshot.tree = {
                    tag: 'document',
                    children: treeOrList
                };
            } else {
                snapshot.tree = treeOrList;
            }
        }

        console.log(snapshot);
        return snapshot;
    };
})();


