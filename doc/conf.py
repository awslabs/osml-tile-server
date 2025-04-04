import datetime
import os
import shutil

from sphinx.ext import apidoc


def generate_openapi_spec() -> None:
    """
    This function creates a temporary FastAPI application that contains the endpoint routes used by this service.
    It then uses that application to generate an OpenAPI YAML file describing the endpoints stored in
    ./_spec/openapi.yaml
    """
    import yaml
    from fastapi import FastAPI

    from aws.osml.tile_server.viewpoint import viewpoint_router

    app_skeleton = FastAPI(
        title="OSML Tile Server",
        description="A minimalistic tile server for imagery hosted in the cloud",
        contact={
            "name": "Amazon Web Services",
            "email": "aws-osml-admin@amazon.com",
            "url": "https://github.com/aws-solutions-library-samples/osml-tile-server/issues",
        },
    )
    app_skeleton.include_router(viewpoint_router)

    os.makedirs("./_spec", exist_ok=True)
    with open("./_spec/openapi.yaml", "w") as f:
        yaml.dump(app_skeleton.openapi(), f)


def run_apidoc(app):
    """Generate doc stubs using sphinx-apidoc."""

    # Generate an OpenAPI YAML file as part of extracting documentation from the source code.
    generate_openapi_spec()

    module_dir = os.path.join(app.srcdir, "../src/aws")
    output_dir = os.path.join(app.srcdir, "_apidoc")
    template_dir = os.path.join(app.srcdir, "_templates")
    excludes = []

    # Ensure that any stale apidoc files are cleaned up first.
    if os.path.exists(output_dir):
        shutil.rmtree(output_dir)

    cmd = [
        "--separate",
        "--module-first",
        "--doc-project=API Reference",
        "--implicit-namespaces",
        "--maxdepth=4",
        "-t",
        template_dir,
        "-o",
        output_dir,
        module_dir,
    ]
    cmd.extend(excludes)
    print(f"Running apidoc with options: {cmd}")
    apidoc.main(cmd)


def setup(app):
    """Register our sphinx-apidoc hook."""
    app.connect("builder-inited", run_apidoc)


# Configuration file for the Sphinx documentation builder.
#
# For the full list of built-in configuration values, see the documentation:
# https://www.sphinx-doc.org/en/master/usage/configuration.html

# -- Project information -----------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#project-information

project = "OversightML Tile Server"
copyright = "{}, Amazon.com".format(datetime.datetime.now().year)
author = "Amazon Web Services"

# -- General configuration ---------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#general-configuration

extensions = [
    "autoapi.extension",
    #    "sphinx.ext.autodoc",
    "sphinx.ext.intersphinx",
    #    "sphinx.ext.napoleon",
    "sphinx.ext.todo",
    "sphinx.ext.viewcode",
    "sphinxcontrib.openapi",
    "sphinx_rtd_theme",
]
autoapi_type = "python"
autoapi_dirs = ["../src"]

source_suffix = ".rst"
master_doc = "index"

autoclass_content = "class"
autodoc_member_order = "bysource"
default_role = "py:obj"

templates_path = ["_templates"]
exclude_patterns = ["_build", "Thumbs.db", ".DS_Store"]

# A string that determines how domain objects (e.g. functions, classes,
# attributes, etc.) are displayed in their table of contents entry.
toc_object_entries_show_parents = "hide"

# -- Options for HTML output -------------------------------------------------

# The theme to use for HTML and HTML Help pages.  See the documentation for
# a list of builtin themes.
#
html_theme = "sphinx_rtd_theme"

html_theme_options = {
    "logo_only": False,
    "display_version": True,
    "prev_next_buttons_location": "bottom",
    "style_external_links": False,
    "vcs_pageview_mode": "",
    # Toc options
    "collapse_navigation": True,
    "sticky_navigation": True,
    "navigation_depth": 4,
    "includehidden": True,
    "titles_only": False,
}

# For cross-linking to types from other libraries
intersphinx_mapping = {
    "python": ("https://docs.python.org/3", None),
}
