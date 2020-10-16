from typing import List, Dict
import csv
from xml.etree import ElementTree
from pathlib import Path
import itertools as it
from collections import namedtuple, Counter, defaultdict

import opencc

from botapi import BotApiError, Botagraph,  BotaIgraph, BotLoginError
from reliure.types import Text


converter = opencc.OpenCC('s2t')

def convert(s: str):
    return converter.convert(s.rstrip(".,)"))


gid = "wikibiographies"

NodeType = namedtuple("NodeType", "name description properties")
EdgeType = namedtuple("EdgeType", "name description properties")



PageNode = namedtuple("PageNode", "id lang url label ")
PageNodeType = NodeType("PageNode",
                        "A wikipage containing a biography",
                        {"id": Text(),
                         "lang": Text(),
                         "url": Text(),
                         "label": Text()
                         })

EntityNode = namedtuple("EntityNode", "id label type lang link_zh link_en id_zh id_en")
EntityNodeType = NodeType("EntityNode",
                        "mention of a Named Entity",
                        {"id": Text(),
                         "label": Text(),
                         "lang": Text(),
                         "type": Text(),
                         "link_zh": Text(),
                         "link_en": Text(),
                         "id_zh": Text(),
                         "id_en": Text()
                         })


MentionEdge = namedtuple("MentionEdge", "source target start end")
MentionEdgeType = EdgeType("MentionEdge", "page --mention--> NE", {'start': Text(), 'end': Text()} )

RefersEdge = namedtuple("RefersEdge", "source target")
RefersEdgeType = EdgeType("RefersEdge", "NE --refers--> Page",  {} )

TranslationEdge = namedtuple("TranslationEdge", "source target")
TranslationEdgeType = EdgeType("TranslationEdge", "page --translation--> page", {} )

# ZH_DIR = Path("/home/pierre/Corpora/WikiBiographies/Biographies_12_08_2020_zh")
# EN_DIR = Path("/home/pierre/Corpora/WikiBiographies/Biographies_12_08_2020_en")

ZH_DIR = Path("/data-ssd/Wikipedia/Biographies_12_08_2020_zh")
EN_DIR = Path("/data-ssd/Wikipedia/Biographies_12_08_2020_en")



def countDegres(edges):
    return Counter([e.source for e in edges]) + Counter([e.target for e in edges])


def getEntitiesTranslations(entities:List[EntityNode]):
    """
    Add coreference and translation links between NE based on wikipedia page links
    :param entities:
    :return:
    """
    forms_zh = defaultdict(set)
    forms_en = defaultdict(set)
    links = set()
    for e in entities:
        if e.id_zh != "None" and e.lang == "zh":
            forms_zh[e.id_zh].add(e.label)
        if e.id_en != "None" and e.lang == "en":
            forms_en[e.id_en].add(e.label)
        if e.id_en != "None" and e.id_zh != 'None':
            links.add((e.id_zh, e.id_en))
    for id, corefs in forms_zh.items():
        ids = [f"E-{id}-{form}" for form in corefs]
        for i, a in enumerate(ids):
            for b in ids[i+1:]:
                yield TranslationEdge(a,b)
    for id, corefs in forms_en.items():
        ids = [f"E-{id}-{form}" for form in corefs]
        for i, a in enumerate(ids):
            for b in ids[i+1:]:
                yield TranslationEdge(a,b)
    for zh, en in links:
        zh_ids = [f"E-{zh}-{form}" for form in forms_zh[zh]]
        en_ids = [f"E-{en}-{form}" for form in forms_en[en]]
        for a in zh_ids:
            for b in en_ids:
                yield TranslationEdge(a,b)

def readOne(dir: Path, lang, knownNE):
    entities = []
    edges =[]
    id = dir.name
    csv_file = Path(dir, f"{id}.csv")
    xml_file = Path(dir, f"{id}.xml")
    if xml_file.exists():
        x = ElementTree.parse(xml_file)
        attrs = x.getroot().attrib
        page = PageNode(f"P-{lang}-" + attrs['id'], lang, attrs['url'], converter.convert(attrs['title']))
        if(lang == "zh" and attrs["id_en"] != "None"):
            edges.append(TranslationEdge(page.id, f"P-en-{attrs['id_en']}"))
        with open(csv_file, newline='') as f:
            reader = csv.DictReader(f, delimiter=';', quoting=csv.QUOTE_NONE )
            rows = [row for row in reader if row['type'] in {"GPE", "ORG", "PERSON","PER", "LOC"}]
            linked = {row['entity'] for row in rows if row[f'link_{lang}'] != 'None'}
            rows = [row for row in rows if row[f'link_{lang}'] != 'None' or row['entity'] not in linked]
            per_doc_entities = set()
            for row in rows:
                    entity_trad = convert(row['entity'])
                    eid = "E-" + row[f'id_{lang}'] + f"-{entity_trad}"
                    ne = EntityNode(eid, entity_trad, row['type'], lang, row.get('link_zh','None'), row['link_en'], row.get('id_zh',"None"), row['id_en'])
                    if eid not in knownNE:
                        knownNE[eid] = ne
                        if ne.id_zh != "None":
                            edges.append(RefersEdge(ne.id, f"P-zh-{ne.id_zh}"))
                        if ne.id_en != "None":
                            edges.append(RefersEdge(ne.id, f"P-en-{ne.id_en}"))
                    if(eid not in per_doc_entities):
                        edges.append(MentionEdge(page.id, ne.id, row['start_pos'], row['end_pos']))
                        per_doc_entities.add(eid)
        return page, edges
    return None, []


def create_graph():
    bot = BotaIgraph(True)
    if bot.has_graph(gid):
        bot.delete_graph(gid)

    bot.create_graph(gid, {'name': gid,
                           'description': "une description du ",
                           'image': "",
                           'tags': ["Botapad"]
                           }
                     )
    nodetypes_uuids = {}
    for nt in [PageNodeType, EntityNodeType]:
        nodetypes_uuids[nt.name] = bot.post_nodetype(gid, nt.name, nt.description, nt.properties)
    edgetypes_uuids = {}
    for et in [MentionEdgeType, RefersEdgeType, TranslationEdgeType]:
        edgetypes_uuids[et.name] = bot.post_edgetype(gid, et.name, et.description, et.properties)
    return bot, nodetypes_uuids, edgetypes_uuids

def node_props(x, shape=None):
    d = dict(x._asdict())
    if shape:
        d['shape'] = shape
    return d

if __name__ == "__main__":
    pages = {}
    ne = {}
    edges = []
    print("read en")
    for dir in it.islice(EN_DIR.iterdir(),300000):
        page, newEdges = readOne(dir, "en", ne)
        if page:
            pages[page.id] = page
            edges.extend(newEdges)
    print("read zh")
    for dir in it.islice(ZH_DIR.iterdir(),300000):
        page, newEdges = readOne(dir, "zh", ne)
        if page:
            pages[page.id] = page
            edges.extend(newEdges)

    bot, ntids, etids = create_graph()

    edges.extend(getEntitiesTranslations(ne.values()))
    valid_nodes = {k for k,v in countDegres(edges).items() if (v > 10 and v < 200) or k.startswith("P")}
    print(Counter(countDegres(edges).values()))
    print(len(valid_nodes))
    nodes_uuids = {}
    def getNodesIterator():
        for p in pages.values():
            assert(isinstance(p, PageNode))
            if(p.id in valid_nodes):
                yield {'nodetype': ntids[PageNodeType.name]['uuid'],
                       'properties': node_props(p, shape="square"),
                       'label': p.label,
                       }
        for e in ne.values():
            assert(isinstance(e, EntityNode))
            if e.id in valid_nodes:
                yield {'nodetype': ntids[EntityNodeType.name]['uuid'],
                       'properties': node_props(e),
                       'label': e.label}

    def getEdgesIterator():
        for e in edges:
            if e.source in valid_nodes and e.target in valid_nodes:
                if isinstance(e, MentionEdge):
                    yield {'edgetype': etids[MentionEdgeType.name]['uuid'],
                            'source': nodes_uuids[e.source],
                            'target': nodes_uuids[e.target],
                            'properties': node_props(e)}
                elif isinstance(e, RefersEdge):
                    if e.source in nodes_uuids and e.target in nodes_uuids:
                        yield {'edgetype': etids[RefersEdgeType.name]['uuid'],
                               'source': nodes_uuids[e.source],
                               'target': nodes_uuids[e.target],
                               'properties': {}}
                elif isinstance(e, TranslationEdge):
                    if e.source in nodes_uuids and e.target in nodes_uuids:
                        yield {'edgetype': etids[TranslationEdgeType.name]['uuid'],
                               'source': nodes_uuids[e.source],
                               'target': nodes_uuids[e.target],
                               'properties': node_props(e)}


    for node, uuid in bot.post_nodes(gid, getNodesIterator(), key=lambda x:x['id']):
        nid = node['properties']['id']
        nodes_uuids[nid] = uuid
    list(bot.post_edges(gid, getEdgesIterator()))
    print("del")
    del nodes_uuids, valid_nodes, ne, edges, pages
    #print(f"{len(pages)} pages, {len(ne)} entities, {len(edges)} links")

    print("build igraph")
    ig = bot.get_igraph(gid)
    import igraph
    import pickle
    print("write pickle")
    ig.write_pickle("pads/wiki.pickle")
